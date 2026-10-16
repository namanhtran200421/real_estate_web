/**
 * Payments by bank transfer (VietQR), confirmed by the owner.
 *
 * Flow:
 *   1. The guest picks what to pay (deposit-first bookings: the 20% security deposit now, the rent from
 *      check-in day; legacy bookings: part or all of the rent); `transferInstructions` returns the account and a
 *      VietQR code with the amount and the booking reference (as transfer note) filled in.
 *   2. Having paid, the guest accepts the stay policy and reports the transfer with a screenshot from
 *      their bank app (`reportTransfer`). The report holds the dates and the owner is emailed.
 *   3. The owner finds the money in the bank app and verifies the report (the money counts and
 *      the booking is confirmed) or rejects it (the guest gets a fresh hold to pay or explain).
 * The site cannot see the bank account: a screenshot is evidence, and a booking is only
 * confirmed once its money has been confirmed by the owner (docs/adr/0001). The money that confirms
 * a booking is its security deposit (deposit-first) or its rent (legacy): `confirmingPurpose`.
 *
 * The owner can also record money that arrived without a report (`recordManualPayment`): cash,
 * or a guest who never reported. Money seen after the hold ran out still confirms the booking
 * while its dates are free. Refunds are made by the owner and recorded here.
 */
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { withTransaction, type Db } from '../../db/pool.js';
import { todayIn } from '../../lib/dates.js';
import { HttpError } from '../../lib/http-error.js';
import { readImageText } from '../../lib/image-text.js';
import type { AdminIdentity } from '../admin-auth/admin-auth.types.js';
import { assertAccess } from '../bookings/booking-access.js';
import { assetIncidentRepository } from '../bookings/asset-incident.repository.js';
import { bookingRepository } from '../bookings/booking.repository.js';
import { guestIdentityRepository } from '../bookings/guest-identity.repository.js';
import {
  confirmingPurpose,
  derivePaymentStatus,
  isDepositFirst,
  isPayable,
  paymentOptions,
  POLICY_VERSION,
  transferNote,
} from '../bookings/booking.rules.js';
import type { BookingRecord, PaymentProvider, PaymentPurpose, TransferInstructions } from '../bookings/booking.types.js';
import { emailService } from '../notifications/email.service.js';
import { depositRefundPlan } from '../bookings/inspection.js';
import { inspectionRepository } from '../bookings/inspection.repository.js';
import { paymentRepository } from './payment.repository.js';
import { showsTransfer, type ExpectedTransfer, type TransferScreenshot } from './transfer-screenshot.js';
import { buildVietQrPayload } from './vietqr.js';

export type PaymentOption = 'deposit' | 'full' | 'asset_security' | 'incident';

/** Transfer screenshots are deleted this long after upload (docs/adr/0002). */
const SCREENSHOT_RETENTION_DAYS = 35;

/**
 * OCR is CPU- and memory-heavy and the underlying worker reads one image at a time. Keep its
 * queue bounded, and never let replays for one booking fill that queue before the transaction's
 * pending-payment check can run.
 */
const MAX_CONCURRENT_SCREENSHOT_CHECKS = 2;
const screenshotChecksInProgress = new Set<string>();

export { transferNote };

function purposeFor(option: PaymentOption): PaymentPurpose {
  if (option === 'asset_security') return 'asset_security';
  if (option === 'incident') return 'incident';
  return 'accommodation';
}

/** Recomputes the money received for a booking and its payment status. */
async function recalculate(booking: BookingRecord, db: Db): Promise<void> {
  const { received, refunded, depositReceived, depositRefunded } = await paymentRepository.totals(booking.id, db);
  await bookingRepository.setPaymentProgress(
    booking.id,
    received - refunded,
    derivePaymentStatus({
      total: booking.totalAmount,
      rentReceived: received,
      rentRefunded: refunded,
      depositReceived,
      depositRefunded,
    }),
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
async function queueOwnerPaymentResult(
  booking: BookingRecord,
  amount: number,
  purpose: PaymentPurpose,
  newlyConfirmed: boolean,
  db: Db,
): Promise<void> {
  const context = await bookingRepository.emailContext(booking.id, db);
  if (newlyConfirmed) {
    await emailService.queueBookingConfirmed(context, db);
  } else {
    await emailService.queuePaymentReceived(context, amount, purpose, db);
  }
}

/** The guest's own booking; 404 when it does not exist or the token belongs to another one. */
async function bookingForGuest(reference: string, token: string | undefined, db?: Db, lock = false): Promise<BookingRecord> {
  const booking = await bookingRepository.findByReference(reference, db, lock);
  if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
  assertAccess(booking.id, token);
  return booking;
}

/** 422: a transfer is only reported after the guest agrees to the stay policy. */
export function policyNotAccepted(): HttpError {
  return HttpError.unprocessable('POLICY_NOT_ACCEPTED', 'Vui lòng đồng ý với chính sách lưu trú trước khi gửi.');
}

/**
 * Money the booking cannot take for that purpose: a deposit on a booking that has none (legacy),
 * or damage before the stay is confirmed.
 * @throws 422 PAYMENT_OPTION_UNAVAILABLE
 */
function assertPurposeApplies(booking: BookingRecord, purpose: PaymentPurpose): void {
  if (purpose === 'asset_security' && !isDepositFirst(booking)) {
    throw HttpError.unprocessable('PAYMENT_OPTION_UNAVAILABLE', 'Đặt phòng này không có tiền đặt cọc riêng.');
  }
  if (purpose === 'incident' && booking.status !== 'confirmed' && booking.status !== 'completed') {
    throw HttpError.unprocessable('PAYMENT_OPTION_UNAVAILABLE', 'Chỉ ghi nhận bồi thường cho đặt phòng đã xác nhận.');
  }
}

/**
 * A deposit above what is still due would be refunded later, though it was meant as rent.
 * Call after `assertPurposeApplies`, which refuses a deposit on a booking without one.
 */
async function assertDepositWithinDue(booking: BookingRecord, amount: number, db: Db): Promise<void> {
  const { assetSecurityDue } = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
  if (amount > assetSecurityDue) {
    throw HttpError.unprocessable(
      'AMOUNT_ABOVE_DEPOSIT',
      `Số tiền vượt tiền đặt cọc còn thiếu (${assetSecurityDue.toLocaleString('vi-VN')} ₫). Hãy xác nhận đúng tiền cọc và ghi nhận phần dư là tiền phòng.`,
    );
  }
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
  const now = new Date();
  const financials = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
  const options = paymentOptions(booking, financials, now, todayIn(env.timezone), false);
  const key = option === 'asset_security' ? 'assetSecurity' : option;
  const amount = options[key];
  if (amount === null) {
    const dead = booking.status === 'cancelled' || booking.status === 'expired';
    const holdOver = booking.status === 'pending' && !isPayable(booking, now);
    if (dead || holdOver || (!isDepositFirst(booking) && !isPayable(booking, now))) {
      throw HttpError.conflict(
        'BOOKING_NOT_PAYABLE',
        'Đặt phòng này đã hết thời gian giữ chỗ hoặc không thể thanh toán. Vui lòng đặt lại.',
      );
    }
    const stayLive = booking.status === 'confirmed' || booking.status === 'completed';
    if (isDepositFirst(booking) && stayLive && option === 'full' && todayIn(env.timezone) < booking.checkIn) {
      const [year, month, day] = booking.checkIn.split('-');
      throw HttpError.unprocessable(
        'RENT_NOT_DUE_YET',
        `Tiền phòng được thanh toán từ ngày nhận phòng (${day}/${month}/${year}).`,
      );
    }
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

function beginScreenshotCheck(bookingId: string): void {
  if (screenshotChecksInProgress.has(bookingId)) {
    throw HttpError.conflict('TRANSFER_REPORT_IN_PROGRESS', 'Ảnh chuyển khoản này đang được xử lý. Vui lòng chờ trong giây lát.');
  }
  if (screenshotChecksInProgress.size >= MAX_CONCURRENT_SCREENSHOT_CHECKS) {
    throw new HttpError(503, 'SCREENSHOT_CHECK_BUSY', 'Hệ thống đang kiểm tra ảnh chuyển khoản khác. Vui lòng thử lại sau ít phút.');
  }
  screenshotChecksInProgress.add(bookingId);
}

/** A deposit-first booking is confirmed only after the whole required deposit has arrived. */
async function confirmationRequirementMet(booking: BookingRecord, purpose: PaymentPurpose, db: Db): Promise<boolean> {
  if (purpose !== confirmingPurpose(booking)) return false;
  if (!isDepositFirst(booking)) return true;
  return (await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db)).assetSecurityDue === 0;
}

/**
 * The guest has transferred and sends the screenshot from their bank app. Holds the dates until
 * the owner checks, and emails both. Reporting again while a report is being checked is refused,
 * so nothing is counted twice and the screenshot the owner is looking at cannot change.
 * @param sendAnyway the guest saw the "not a transfer screenshot" warning and sends it regardless
 * @param acceptPolicy the guest agreed to the stay policy; recorded as an event
 * @throws 422 POLICY_NOT_ACCEPTED without `acceptPolicy`
 * @throws 422 NOT_A_TRANSFER_SCREENSHOT when the image shows no transfer (unless `sendAnyway`)
 */
async function reportTransfer(
  reference: string,
  token: string | undefined,
  option: PaymentOption,
  screenshot: TransferScreenshot,
  sendAnyway: boolean,
  acceptPolicy: boolean,
): Promise<void> {
  if (!acceptPolicy) throw policyNotAccepted();
  // Read the image before taking any lock: OCR takes a moment. The checks repeat under the lock.
  const unlocked = await bookingForGuest(reference, token);
  const purpose = purposeFor(option);
  const expected = { note: transferNote(unlocked.reference, purpose), amount: await amountFor(unlocked, option) };
  beginScreenshotCheck(unlocked.id);
  try {
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
      if (purpose === confirmingPurpose(booking) && booking.status === 'pending') await bookingRepository.clearHold(booking.id, db);
      await bookingRepository.addEvent(booking.id, 'policy_accepted', 'guest', { version: POLICY_VERSION, paymentId }, db);
      await bookingRepository.addEvent(booking.id, 'transfer_reported', 'guest', { amount, purpose, paymentId }, db);

      const context = await bookingRepository.emailContext(booking.id, db);
      await emailService.queueTransferReported(
        context,
        { amount, purpose, note, bankName: env.bank.name, accountNumber: env.bank.accountNumber },
        db,
      );
    });
  } finally {
    screenshotChecksInProgress.delete(unlocked.id);
  }
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
    assertPurposeApplies(booking, payment.purpose);
    if (payment.purpose === 'asset_security') await assertDepositWithinDue(booking, received, db);

    await paymentRepository.markVerified(payment.id, received, admin.id, db);
    await bookingRepository.addEvent(booking.id, 'transfer_verified', admin.email, { amount: received, paymentId }, db);
    await recalculate(booking, db);
    const requirementMet = await confirmationRequirementMet(booking, payment.purpose, db);
    const newlyConfirmed = requirementMet && (await confirmIfPending(booking, admin.email, db));
    if (!requirementMet && payment.purpose === confirmingPurpose(booking) && booking.status === 'pending') {
      await bookingRepository.holdForMinutes(booking.id, env.booking.holdMinutes, db);
    }
    await queueOwnerPaymentResult(booking, received, payment.purpose, newlyConfirmed, db);
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
    const confirming = payment.purpose === confirmingPurpose(booking) && booking.status === 'pending' && booking.amountPaid === 0;
    if (confirming) await bookingRepository.holdForMinutes(booking.id, env.booking.holdMinutes, db);

    const context = await bookingRepository.emailContext(booking.id, db);
    await emailService.queueTransferNotReceived(
      context,
      reason,
      confirming ? env.booking.holdMinutes : null,
      db,
    );
  });
}

/**
 * Records money the owner received: a transfer seen in the bank app, or cash at check-in.
 * Confirms a pending booking, or one whose hold ran out if its dates are still free.
 * @throws 422 PAYMENT_OPTION_UNAVAILABLE for a purpose the booking cannot take (see `assertPurposeApplies`)
 * @throws 422 DEPOSIT_REQUIRED_FIRST, AMOUNT_ABOVE_DEPOSIT
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
    assertPurposeApplies(booking, payment.purpose);

    if (isDepositFirst(booking) && (booking.status === 'pending' || booking.status === 'expired') && payment.purpose !== 'asset_security') {
      throw HttpError.unprocessable('DEPOSIT_REQUIRED_FIRST', 'Đặt phòng này cần ghi nhận tiền đặt cọc trước.');
    }
    if (payment.purpose === 'asset_security') await assertDepositWithinDue(booking, payment.amount, db);

    // The money showed up after the hold ran out: the booking stands if its dates are still free.
    let current = booking;
    if (payment.purpose === confirmingPurpose(booking) && booking.status === 'expired') {
      if (!(await bookingRepository.reactivate(booking.id, db))) {
        throw HttpError.conflict(
          'DATES_TAKEN',
          'Ngày của đặt phòng này đã có khách khác đặt. Hãy liên hệ khách để đổi ngày hoặc hoàn tiền.',
        );
      }
      current = { ...booking, status: 'pending', holdExpiresAt: null };
      await bookingRepository.addEvent(booking.id, 'reactivated', admin.email, { reason: 'late_payment' }, db);
      // The stay is back on: keep the guests' identities as for any stay, or ask for them again.
      // Bookings made before identities were collected have none to restore and none purged.
      const restored = await guestIdentityRepository.restoreRetention(booking.id, booking.checkOut, db);
      if (restored === 0 && (await bookingRepository.hasEvent(booking.id, 'identities_purged', db))) {
        await bookingRepository.addEvent(booking.id, 'identities_missing', 'system', { reason: 'purged_before_reactivation' }, db);
      }
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
    const requirementMet = await confirmationRequirementMet(current, payment.purpose, db);
    const newlyConfirmed = requirementMet && (await confirmIfPending(current, admin.email, db));
    if (!requirementMet && payment.purpose === confirmingPurpose(current) && current.status === 'pending') {
      await bookingRepository.holdForMinutes(current.id, env.booking.holdMinutes, db);
    }
    await queueOwnerPaymentResult(current, payment.amount, payment.purpose, newlyConfirmed, db);
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
    // Lock order is booking, then payment (as in refundDeposit), so the two can never deadlock.
    const unlocked = await paymentRepository.findById(paymentId, db);
    if (!unlocked) throw HttpError.notFound('Không tìm thấy giao dịch.');
    const booking = (await bookingRepository.findById(unlocked.bookingId, db, true))!;
    const payment = await paymentRepository.findById(paymentId, db, true);
    if (!payment) throw HttpError.notFound('Không tìm thấy giao dịch.');
    if (payment.state !== 'succeeded') throw HttpError.conflict('INVALID_STATUS', 'Chỉ hoàn tiền được khoản đã nhận.');

    const refundable = payment.amount - (await paymentRepository.refundedTotal(payment.id, db));
    if (request.amount > refundable) {
      throw HttpError.unprocessable('REFUND_TOO_LARGE', `Chỉ còn hoàn được tối đa ${refundable.toLocaleString('vi-VN')} ₫.`);
    }

    if (payment.purpose === 'asset_security') {
      // Deposit applied to damage is no longer the guest's: a manual refund cannot give it back.
      const { assetSecurityHeld } = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
      if (request.amount > assetSecurityHeld) {
        throw HttpError.unprocessable(
          'REFUND_TOO_LARGE',
          `Chỉ còn hoàn được tối đa ${assetSecurityHeld.toLocaleString('vi-VN')} ₫ tiền đặt cọc.`,
        );
      }
    }
    await paymentRepository.insertRefund({ paymentId, amount: request.amount, reason: request.reason, createdBy: admin.id }, db);
    await bookingRepository.addEvent(booking.id, 'refund_recorded', admin.email, { amount: request.amount, reason: request.reason }, db);
    await recalculate(booking, db);
    await emailService.queueRefundIssued(await bookingRepository.emailContext(booking.id, db), request.amount, db);
  });
}

/**
 * Gives back the security deposit still held, after the stay and its inspection. One click, one
 * transaction: the booking and the deposit payments are locked first, so two clicks can never
 * refund more than is held. The guest gets one email with the total.
 * @throws 409 INVALID_STATUS, RENT_DUE, INSPECTION_REQUIRED, INCIDENT_OPEN, INCIDENT_DUE, NOTHING_TO_REFUND
 */
async function refundDeposit(reference: string, admin: AdminIdentity): Promise<void> {
  await withTransaction(async (db) => {
    const booking = await bookingRepository.findByReference(reference, db, true);
    if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
    if (booking.status !== 'completed') {
      throw HttpError.conflict('INVALID_STATUS', 'Hãy ghi nhận khách trả phòng trước khi hoàn cọc.');
    }
    if (booking.totalAmount - booking.amountPaid >= 1000) {
      throw HttpError.conflict('RENT_DUE', 'Khách chưa thanh toán đủ tiền phòng. Hãy ghi nhận tiền phòng trước khi hoàn cọc.');
    }
    if (!(await inspectionRepository.get(booking.id, db))) {
      throw HttpError.conflict('INSPECTION_REQUIRED', 'Hãy lưu kết quả kiểm tra trả phòng trước khi hoàn cọc.');
    }
    const incidents = await assetIncidentRepository.list(booking.id, db);
    if (incidents.some((incident) => incident.status === 'open')) {
      throw HttpError.conflict('INCIDENT_OPEN', 'Còn khoản hư hỏng chưa xử lý.');
    }
    const { incidentAmountDue } = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
    if (incidentAmountDue >= 1000) {
      throw HttpError.conflict(
        'INCIDENT_DUE',
        'Khách còn nợ tiền bồi thường. Hãy ghi nhận khoản bồi thường trước khi hoàn cọc.',
      );
    }

    // Lock the deposit payments, then read what is held and refundable: two clicks queue here.
    const deposits = (await paymentRepository.listForBooking(booking.id, db)).filter(
      (payment) => payment.purpose === 'asset_security' && payment.state === 'succeeded',
    );
    const refundable: { id: string; refundable: number }[] = [];
    for (const deposit of deposits) {
      const locked = (await paymentRepository.findById(deposit.id, db, true))!;
      refundable.push({ id: locked.id, refundable: locked.amount - (await paymentRepository.refundedTotal(locked.id, db)) });
    }
    const { assetSecurityHeld } = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
    if (assetSecurityHeld < 1000) throw HttpError.conflict('NOTHING_TO_REFUND', 'Không còn tiền cọc để hoàn.');

    const plan = depositRefundPlan(refundable, assetSecurityHeld);
    for (const { paymentId, amount } of plan) {
      await paymentRepository.insertRefund(
        { paymentId, amount, reason: 'Hoàn cọc sau kiểm tra trả phòng', createdBy: admin.id },
        db,
      );
    }
    const total = plan.reduce((sum, step) => sum + step.amount, 0);
    await bookingRepository.addEvent(booking.id, 'deposit_refunded', admin.email, { amount: total }, db);
    await recalculate(booking, db);
    await emailService.queueRefundIssued(await bookingRepository.emailContext(booking.id, db), total, db);
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
  refundDeposit,
  purgeOldTransferScreenshots,
};
