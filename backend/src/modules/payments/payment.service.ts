/**
 * Payments by bank transfer (VietQR), confirmed by the owner.
 *
 * Flow:
 *   1. The guest picks deposit or full payment; `transferInstructions` returns the account and a
 *      VietQR code with the amount and the booking reference (as transfer note) filled in.
 *   2. Having paid, the guest reports the transfer with a screenshot from their bank app
 *      (`reportTransfer`). The report holds the dates and the owner is emailed.
 *   3. The owner finds the money in the bank app and verifies the report (the money counts and
 *      the booking is confirmed) or rejects it (the guest gets a fresh hold to pay or explain).
 * The site cannot see the bank account: a screenshot is evidence, and a booking is only
 * confirmed once its money has been confirmed by the owner (docs/adr/0001).
 *
 * The owner can also record money that arrived without a report (`recordManualPayment`): cash,
 * or a guest who never reported. Money seen after the hold ran out still confirms the booking
 * while its dates are free. Refunds are made by the owner and recorded here.
 */
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { withTransaction, type Db } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { readImageText } from '../../lib/image-text.js';
import type { AdminIdentity } from '../admin-auth/admin-auth.types.js';
import { assertAccess } from '../bookings/booking-access.js';
import { assetIncidentRepository } from '../bookings/asset-incident.repository.js';
import { bookingRepository } from '../bookings/booking.repository.js';
import { derivePaymentStatus, isPayable, paymentOptions } from '../bookings/booking.rules.js';
import type { BookingRecord, PaymentProvider, PaymentPurpose, TransferInstructions } from '../bookings/booking.types.js';
import { emailService } from '../notifications/email.service.js';
import { paymentRepository } from './payment.repository.js';
import { showsTransfer, type ExpectedTransfer, type TransferScreenshot } from './transfer-screenshot.js';
import { buildVietQrPayload } from './vietqr.js';

export type PaymentOption = 'deposit' | 'full' | 'asset_security' | 'incident';

/** Transfer screenshots are deleted this long after upload (docs/adr/0002). */
const SCREENSHOT_RETENTION_DAYS = 35;

/** "RE-2611-K7Q3M" → "RE2611K7Q3M": banks drop or mangle dashes in transfer notes. */
export function transferNote(reference: string, purpose: PaymentPurpose = 'accommodation'): string {
  const suffix = purpose === 'asset_security' ? 'TS' : purpose === 'incident' ? 'BT' : '';
  return `${reference.replaceAll('-', '')}${suffix}`;
}

function purposeFor(option: PaymentOption): PaymentPurpose {
  if (option === 'asset_security') return 'asset_security';
  if (option === 'incident') return 'incident';
  return 'accommodation';
}

/** Recomputes the money received for a booking and its payment status. */
async function recalculate(booking: BookingRecord, db: Db): Promise<void> {
  const { received, refunded } = await paymentRepository.totals(booking.id, db);
  await bookingRepository.setPaymentProgress(
    booking.id,
    received - refunded,
    derivePaymentStatus(booking.totalAmount, received, refunded),
    db,
  );
}

/** Money is confirmed, so the booking is too. Returns true only for the first confirmation. */
async function confirmIfPending(booking: BookingRecord, actor: string, db: Db): Promise<boolean> {
  if (booking.status !== 'pending') return false;
  await bookingRepository.markConfirmed(booking.id, db);
  await bookingRepository.addEvent(booking.id, 'confirmed', actor, { reason: 'payment_received' }, db);
  return true;
}

/** Queue one clear guest email for the owner's action in the same transaction. */
async function queueOwnerPaymentResult(booking: BookingRecord, amount: number, newlyConfirmed: boolean, db: Db): Promise<void> {
  const context = await bookingRepository.emailContext(booking.id, db);
  if (newlyConfirmed) {
    await emailService.queueBookingConfirmed(context, db);
  } else {
    await emailService.queuePaymentReceived(context, amount, db);
  }
}

/** The guest's own booking; 404 when it does not exist or the token belongs to another one. */
async function bookingForGuest(reference: string, token: string | undefined, db?: Db, lock = false): Promise<BookingRecord> {
  const booking = await bookingRepository.findByReference(reference, db, lock);
  if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
  assertAccess(booking.id, token);
  return booking;
}

function screenshotNotFound(): HttpError {
  return HttpError.notFound('Không tìm thấy ảnh chuyển khoản.');
}

/** Amount for the chosen option, or the reason it cannot be paid now. */
async function amountFor(booking: BookingRecord, option: PaymentOption, db?: Db): Promise<number> {
  const pending = await paymentRepository.findPendingForBooking(booking.id, db);
  if (pending) {
    throw HttpError.conflict('TRANSFER_BEING_CHECKED', 'Chủ nhà đang kiểm tra khoản chuyển bạn đã báo. Vui lòng chờ xác nhận.');
  }
  const purpose = purposeFor(option);
  if (purpose !== 'accommodation') {
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw HttpError.conflict('BOOKING_NOT_PAYABLE', 'Chỉ thanh toán khoản này sau khi đặt phòng đã được xác nhận.');
    }
    const financials = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
    const amount = purpose === 'asset_security' ? financials.assetSecurityDue : financials.incidentAmountDue;
    if (amount < 1_000) {
      throw HttpError.unprocessable('PAYMENT_OPTION_UNAVAILABLE', 'Khoản này hiện không còn số tiền cần thanh toán.');
    }
    return amount;
  }

  const now = new Date();
  if (!isPayable(booking, now)) {
    throw HttpError.conflict(
      'BOOKING_NOT_PAYABLE',
      'Đặt phòng này đã hết thời gian giữ chỗ hoặc không thể thanh toán. Vui lòng đặt lại.',
    );
  }
  const accommodationOption = option as 'deposit' | 'full';
  const amount = paymentOptions(booking, now, false)[accommodationOption];
  if (amount === null) {
    throw HttpError.unprocessable('PAYMENT_OPTION_UNAVAILABLE', 'Lựa chọn thanh toán này không còn áp dụng cho đặt phòng.');
  }
  return amount;
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------

/** Account details and a VietQR code for the chosen amount. */
async function transferInstructions(
  reference: string,
  token: string | undefined,
  option: PaymentOption,
): Promise<TransferInstructions> {
  const booking = await bookingForGuest(reference, token);
  const amount = await amountFor(booking, option);
  const note = transferNote(booking.reference, purposeFor(option));
  const payload = buildVietQrPayload({ bin: env.bank.bin, accountNumber: env.bank.accountNumber, amount, note });

  return {
    bankName: env.bank.name,
    accountNumber: env.bank.accountNumber,
    accountName: env.bank.accountName,
    amount,
    note,
    // PNG rather than SVG: guests on a phone save it and open it from their bank app's QR scanner.
    qrImage: await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 480 }),
  };
}

/**
 * The screenshot check: whether the image shows a bank transfer, or null when it could not be read.
 * Only tells an unrelated image from a transfer screenshot; the owner still checks the bank.
 */
async function checkScreenshot(screenshot: TransferScreenshot, expected: ExpectedTransfer): Promise<boolean | null> {
  const text = await readImageText(screenshot.data);
  if (text === undefined) return null;
  return showsTransfer(text, expected);
}

/**
 * The guest has transferred and sends the screenshot from their bank app. Holds the dates until
 * the owner checks, and emails both. Reporting again while a report is being checked is refused,
 * so nothing is counted twice and the screenshot the owner is looking at cannot change.
 * @param sendAnyway the guest saw the "not a transfer screenshot" warning and sends it regardless
 * @throws 422 NOT_A_TRANSFER_SCREENSHOT when the image shows no transfer (unless `sendAnyway`)
 */
async function reportTransfer(
  reference: string,
  token: string | undefined,
  option: PaymentOption,
  screenshot: TransferScreenshot,
  sendAnyway: boolean,
): Promise<void> {
  // Read the image before taking any lock: OCR takes a moment. The checks repeat under the lock.
  const unlocked = await bookingForGuest(reference, token);
  const purpose = purposeFor(option);
  const expected = { note: transferNote(unlocked.reference, purpose), amount: await amountFor(unlocked, option) };
  const shows = await checkScreenshot(screenshot, expected);
  if (shows === false && !sendAnyway) {
    throw HttpError.unprocessable(
      'NOT_A_TRANSFER_SCREENSHOT',
      'Ảnh này không giống ảnh chuyển khoản. Vui lòng chọn ảnh chụp màn hình giao dịch thành công trong ứng dụng ngân hàng.',
    );
  }

  await withTransaction(async (db) => {
    const booking = await bookingForGuest(reference, token, db, true);
    const amount = await amountFor(booking, option, db);
    const note = transferNote(booking.reference, purpose);

    const paymentId = await paymentRepository.insertReported(booking.id, purpose, amount, note, db);
    await paymentRepository.insertScreenshot(paymentId, screenshot, shows, db);
    if (purpose === 'accommodation') await bookingRepository.clearHold(booking.id, db);
    await bookingRepository.addEvent(booking.id, 'transfer_reported', 'guest', { amount, purpose, paymentId }, db);

    const context = await bookingRepository.emailContext(booking.id, db);
    await emailService.queueTransferReported(
      context,
      { amount, purpose, note, bankName: env.bank.name, accountNumber: env.bank.accountNumber },
      db,
    );
  });
}

/**
 * Lets a guest's upload be refused before its body is read: only someone who can open the
 * booking may send a screenshot for it.
 */
async function assertGuestAccess(reference: string, token: string | undefined): Promise<void> {
  await bookingForGuest(reference, token);
}

/** The screenshot attached to the reported transfer the owner is still checking. */
async function reportedTransferScreenshot(reference: string, token: string | undefined): Promise<TransferScreenshot> {
  const booking = await bookingForGuest(reference, token);
  const reported = await paymentRepository.findPendingForBooking(booking.id);
  const screenshot = reported && (await paymentRepository.findScreenshot(reported.id));
  if (!screenshot) throw screenshotNotFound();
  return screenshot;
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

async function lockedPendingTransfer(paymentId: string, db: Db) {
  const payment = await paymentRepository.findById(paymentId, db, true);
  if (!payment) throw HttpError.notFound('Không tìm thấy giao dịch.');
  if (payment.state !== 'pending') throw HttpError.conflict('INVALID_STATUS', 'Giao dịch này đã được xử lý.');
  const booking = (await bookingRepository.findById(payment.bookingId, db, true))!;
  return { payment, booking };
}

/**
 * The owner saw the transfer in the bank account. The money counts and the booking is confirmed.
 * @param amount what actually arrived (defaults to what the guest reported)
 */
async function verifyTransfer(paymentId: string, amount: number | undefined, admin: AdminIdentity): Promise<void> {
  await withTransaction(async (db) => {
    const { payment, booking } = await lockedPendingTransfer(paymentId, db);
    const received = amount ?? payment.amount;

    await paymentRepository.markVerified(payment.id, received, admin.id, db);
    await bookingRepository.addEvent(booking.id, 'transfer_verified', admin.email, { amount: received, paymentId }, db);
    await recalculate(booking, db);
    const newlyConfirmed = payment.purpose === 'accommodation' && (await confirmIfPending(booking, admin.email, db));
    await queueOwnerPaymentResult(booking, received, newlyConfirmed, db);
  });
}

/**
 * The transfer is not in the account. An unpaid booking gets a fresh short hold so the guest can
 * still pay (or explain); after that its dates are released as usual.
 */
async function rejectTransfer(paymentId: string, reason: string, admin: AdminIdentity): Promise<void> {
  await withTransaction(async (db) => {
    const { payment, booking } = await lockedPendingTransfer(paymentId, db);

    await paymentRepository.markFailed(payment.id, reason, admin.id, db);
    await bookingRepository.addEvent(booking.id, 'transfer_rejected', admin.email, { amount: payment.amount, reason }, db);
    if (payment.purpose === 'accommodation' && booking.status === 'pending' && booking.amountPaid === 0) {
      await bookingRepository.holdForMinutes(booking.id, env.booking.holdMinutes, db);
    }

    const context = await bookingRepository.emailContext(booking.id, db);
    await emailService.queueTransferNotReceived(
      context,
      reason,
      payment.purpose === 'accommodation' ? env.booking.holdMinutes : null,
      db,
    );
  });
}

/**
 * Records money the owner received: a transfer seen in the bank app, or cash at check-in.
 * Confirms a pending booking, or one whose hold ran out if its dates are still free.
 * @throws 409 DATES_TAKEN when an expired booking's dates were booked by someone else
 */
async function recordManualPayment(
  reference: string,
  payment: { method: PaymentProvider; purpose: PaymentPurpose; amount: number; note?: string },
  admin: AdminIdentity,
): Promise<void> {
  await withTransaction(async (db) => {
    const booking = await bookingRepository.findByReference(reference, db, true);
    if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
    if (booking.status === 'cancelled') {
      throw HttpError.conflict('INVALID_STATUS', 'Không ghi nhận thanh toán cho đặt phòng đã huỷ.');
    }

    // The money showed up after the hold ran out: the booking stands if its dates are still free.
    let current = booking;
    if (payment.purpose === 'accommodation' && booking.status === 'expired') {
      if (!(await bookingRepository.reactivate(booking.id, db))) {
        throw HttpError.conflict(
          'DATES_TAKEN',
          'Ngày của đặt phòng này đã có khách khác đặt. Hãy liên hệ khách để đổi ngày hoặc hoàn tiền.',
        );
      }
      current = { ...booking, status: 'pending' };
      await bookingRepository.addEvent(booking.id, 'reactivated', admin.email, { reason: 'late_payment' }, db);
    }

    const paymentId = await paymentRepository.insertManual(
      {
        bookingId: booking.id,
        provider: payment.method,
        purpose: payment.purpose,
        amount: payment.amount,
        note: payment.note,
        recordedBy: admin.id,
      },
      db,
    );
    await bookingRepository.addEvent(
      booking.id,
      'payment_recorded',
      admin.email,
      { method: payment.method, purpose: payment.purpose, amount: payment.amount, paymentId, note: payment.note },
      db,
    );
    await recalculate(current, db);
    const newlyConfirmed = payment.purpose === 'accommodation' && (await confirmIfPending(current, admin.email, db));
    await queueOwnerPaymentResult(current, payment.amount, newlyConfirmed, db);
  });
}

/** The screenshot the guest attached to a reported transfer, while it is kept. */
async function transferScreenshot(paymentId: string): Promise<TransferScreenshot> {
  const screenshot = await paymentRepository.findScreenshot(paymentId);
  if (!screenshot) throw screenshotNotFound();
  return screenshot;
}

/** Records money the owner gave back (the owner makes the transfer from their bank app). */
async function recordRefund(paymentId: string, request: { amount: number; reason: string }, admin: AdminIdentity): Promise<void> {
  await withTransaction(async (db) => {
    const payment = await paymentRepository.findById(paymentId, db, true);
    if (!payment) throw HttpError.notFound('Không tìm thấy giao dịch.');
    if (payment.state !== 'succeeded') throw HttpError.conflict('INVALID_STATUS', 'Chỉ hoàn tiền được khoản đã nhận.');

    const refundable = payment.amount - (await paymentRepository.refundedTotal(payment.id, db));
    if (request.amount > refundable) {
      throw HttpError.unprocessable('REFUND_TOO_LARGE', `Chỉ còn hoàn được tối đa ${refundable.toLocaleString('vi-VN')} ₫.`);
    }

    const booking = (await bookingRepository.findById(payment.bookingId, db, true))!;
    await paymentRepository.insertRefund({ paymentId, amount: request.amount, reason: request.reason, createdBy: admin.id }, db);
    await bookingRepository.addEvent(booking.id, 'refund_recorded', admin.email, { amount: request.amount, reason: request.reason }, db);
    await recalculate(booking, db);
    await emailService.queueRefundIssued(await bookingRepository.emailContext(booking.id, db), request.amount, db);
  });
}

// ---------------------------------------------------------------------------
// Background job
// ---------------------------------------------------------------------------

/**
 * Deletes transfer screenshots 35 days after upload, once the owner has answered the report.
 * The payment and its history stay; the bank statement is the lasting record of the money.
 * @param now the job's clock (tests pass a later one)
 */
async function purgeOldTransferScreenshots(now = new Date()): Promise<number> {
  return paymentRepository.deleteCheckedScreenshotsOlderThan(SCREENSHOT_RETENTION_DAYS, now);
}

export const paymentService = {
  transferInstructions,
  assertGuestAccess,
  reportTransfer,
  reportedTransferScreenshot,
  transferScreenshot,
  verifyTransfer,
  rejectTransfer,
  recordManualPayment,
  recordRefund,
  purgeOldTransferScreenshots,
};
