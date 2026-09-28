/**
 * Payments by bank transfer (VietQR), confirmed by the owner.
 *
 * Flow:
 *   1. The guest picks deposit or full payment; `transferInstructions` returns the account and a
 *      VietQR code with the amount and the booking reference (as transfer note) filled in.
 *   2. After transferring, the guest reports it (`reportTransfer`). The booking's dates are then
 *      held without a deadline, and the owner is emailed to check the bank account.
 *   3. The owner either verifies it (`verifyTransfer`): the money counts and the booking is
 *      confirmed; or rejects it (`rejectTransfer`): the guest gets a short hold to sort it out.
 * A booking is only confirmed once its money has been confirmed by the owner.
 *
 * Money received in person (cash, or a transfer the guest never reported) is recorded directly by
 * the owner; refunds are made by the owner and recorded here.
 */
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { withTransaction, type Db } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import type { AdminIdentity } from '../admin-auth/admin-auth.types.js';
import { assertAccess } from '../bookings/booking-access.js';
import { bookingRepository } from '../bookings/booking.repository.js';
import { derivePaymentStatus, isPayable, paymentOptions } from '../bookings/booking.rules.js';
import type { BookingRecord, PaymentProvider, TransferInstructions } from '../bookings/booking.types.js';
import { emailService } from '../notifications/email.service.js';
import { paymentRepository } from './payment.repository.js';
import { buildVietQrPayload } from './vietqr.js';

export type PaymentOption = 'deposit' | 'full';

/** "RE-2611-K7Q3M" → "RE2611K7Q3M": banks drop or mangle dashes in transfer notes. */
export function transferNote(reference: string): string {
  return reference.replaceAll('-', '');
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

async function lockedBookingForGuest(reference: string, token: string | undefined, db: Db): Promise<BookingRecord> {
  const booking = await bookingRepository.findByReference(reference, db, true);
  if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
  assertAccess(booking.id, token);
  return booking;
}

/** Amount for the chosen option, or the reason it cannot be paid now. */
async function amountFor(booking: BookingRecord, option: PaymentOption, db?: Db): Promise<number> {
  const pending = await paymentRepository.findPendingForBooking(booking.id, db);
  if (pending) {
    throw HttpError.conflict('TRANSFER_BEING_CHECKED', 'Chủ nhà đang kiểm tra khoản chuyển bạn đã báo. Vui lòng chờ xác nhận.');
  }
  const now = new Date();
  if (!isPayable(booking, now)) {
    throw HttpError.conflict(
      'BOOKING_NOT_PAYABLE',
      'Đặt phòng này đã hết thời gian giữ chỗ hoặc không thể thanh toán. Vui lòng đặt lại.',
    );
  }
  const amount = paymentOptions(booking, now, false)[option];
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
  const booking = await bookingRepository.findByReference(reference);
  if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
  assertAccess(booking.id, token);

  const amount = await amountFor(booking, option);
  const note = transferNote(booking.reference);
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
 * The guest says they have transferred. Holds the dates until the owner checks, and emails both.
 * Reporting again while a report is being checked is refused, so nothing is counted twice.
 */
async function reportTransfer(reference: string, token: string | undefined, option: PaymentOption): Promise<void> {
  await withTransaction(async (db) => {
    const booking = await lockedBookingForGuest(reference, token, db);
    const amount = await amountFor(booking, option, db);
    const note = transferNote(booking.reference);

    const paymentId = await paymentRepository.insertReported(booking.id, amount, note, db);
    await bookingRepository.clearHold(booking.id, db);
    await bookingRepository.addEvent(booking.id, 'transfer_reported', 'guest', { amount, paymentId }, db);

    const context = await bookingRepository.emailContext(booking.id, db);
    await emailService.queueTransferReported(
      context,
      { amount, note, bankName: env.bank.name, accountNumber: env.bank.accountNumber },
      db,
    );
  });
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
    const newlyConfirmed = await confirmIfPending(booking, admin.email, db);
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
    if (booking.status === 'pending' && booking.amountPaid === 0) {
      await bookingRepository.holdForMinutes(booking.id, env.booking.holdMinutes, db);
    }

    const context = await bookingRepository.emailContext(booking.id, db);
    await emailService.queueTransferNotReceived(context, reason, env.booking.holdMinutes, db);
  });
}

/** Records money the owner received directly, e.g. the balance paid at check-in. Confirms a pending booking. */
async function recordManualPayment(
  reference: string,
  payment: { method: PaymentProvider; amount: number; note?: string },
  admin: AdminIdentity,
): Promise<void> {
  await withTransaction(async (db) => {
    const booking = await bookingRepository.findByReference(reference, db, true);
    if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
    if (booking.status === 'cancelled' || booking.status === 'expired') {
      throw HttpError.conflict('INVALID_STATUS', 'Không ghi nhận thanh toán cho đặt phòng đã huỷ hoặc hết hạn.');
    }

    const paymentId = await paymentRepository.insertManual(
      { bookingId: booking.id, provider: payment.method, amount: payment.amount, note: payment.note, recordedBy: admin.id },
      db,
    );
    await bookingRepository.addEvent(
      booking.id,
      'payment_recorded',
      admin.email,
      { method: payment.method, amount: payment.amount, paymentId, note: payment.note },
      db,
    );
    await recalculate(booking, db);
    const newlyConfirmed = await confirmIfPending(booking, admin.email, db);
    await queueOwnerPaymentResult(booking, payment.amount, newlyConfirmed, db);
  });
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

export const paymentService = {
  transferInstructions,
  reportTransfer,
  verifyTransfer,
  rejectTransfer,
  recordManualPayment,
  recordRefund,
};
