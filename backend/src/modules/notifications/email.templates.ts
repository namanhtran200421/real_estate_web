/**
 * Email content, in Vietnamese. Each builder returns subject, HTML and a plain-text version
 * (for clients that block HTML, and for spam filters that penalise HTML-only mail).
 *
 * Every value that can come from a guest is HTML-escaped before it is placed in the markup.
 */
import { env } from '../../config/env.js';
import type { OutgoingEmail } from './email.repository.js';

/** Everything the booking emails show. */
export interface BookingEmailContext {
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  apartmentName: string;
  apartmentAddress: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  guests: number;
  nights: number;
  total: number;
  amountPaid: number;
  status: string;
  message: string | null;
}

type Content = Omit<OutgoingEmail, 'to'>;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
  completed: 'Đã hoàn thành',
  expired: 'Đã hết hạn',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function lookupUrl(reference: string): string {
  return `${env.siteUrl}/booking/manage?ref=${encodeURIComponent(reference)}`;
}

function adminBookingUrl(reference: string): string {
  return `${env.siteUrl}/admin/bookings/${encodeURIComponent(reference)}`;
}

/** Label/value rows rendered as a table in HTML and as lines in text. */
type Rows = [label: string, value: string][];

function bookingRows(booking: BookingEmailContext): Rows {
  return [
    ['Mã đặt phòng', booking.reference],
    ['Căn hộ', booking.apartmentName],
    ['Địa chỉ', booking.apartmentAddress],
    ['Nhận phòng', `${formatDate(booking.checkIn)}, từ ${booking.checkInTime}`],
    ['Trả phòng', `${formatDate(booking.checkOut)}, trước ${booking.checkOutTime}`],
    ['Số đêm · khách', `${booking.nights} đêm · ${booking.guests} khách`],
    ['Tổng tiền', formatVnd(booking.total)],
    ['Đã thanh toán', formatVnd(booking.amountPaid)],
    ['Còn lại', formatVnd(Math.max(booking.total - booking.amountPaid, 0))],
    ['Trạng thái', STATUS_LABELS[booking.status] ?? booking.status],
  ];
}

interface Layout {
  subject: string;
  heading: string;
  paragraphs: string[];
  rows?: Rows;
  button?: { label: string; url: string };
}

function render(layout: Layout): Content {
  const paragraphsHtml = layout.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`)
    .join('');

  let rowsHtml = '';
  let rowsText = '';
  if (layout.rows) {
    const cells = layout.rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:8px 16px 8px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
          `<td style="padding:8px 0;color:#1a1a1a">${escapeHtml(value)}</td></tr>`,
      )
      .join('');
    rowsHtml = `<table role="presentation" style="border-collapse:collapse;margin:8px 0 24px;border-top:1px solid #e8e4df;border-bottom:1px solid #e8e4df;width:100%">${cells}</table>`;
    rowsText = `\n${layout.rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n`;
  }

  let buttonHtml = '';
  let buttonText = '';
  if (layout.button) {
    buttonHtml = `<p style="margin:24px 0"><a href="${escapeHtml(layout.button.url)}" style="display:inline-block;background:#1a1a1a;color:#fafaf8;padding:12px 24px;border-radius:6px;text-decoration:none">${escapeHtml(layout.button.label)}</a></p>`;
    buttonText = `\n${layout.button.label}: ${layout.button.url}\n`;
  }

  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#fafaf8;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#8a612e">${escapeHtml(env.siteName)}</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:normal">${escapeHtml(layout.heading)}</h1>
${paragraphsHtml}${rowsHtml}${buttonHtml}
<p style="margin:32px 0 0;font-size:13px;color:#6b6b6b">${escapeHtml(env.siteName)} · ${escapeHtml(env.siteUrl)}</p>
</div></body></html>`;

  const text = `${layout.heading}\n\n${layout.paragraphs.join('\n\n')}\n${rowsText}${buttonText}\n${env.siteName} · ${env.siteUrl}\n`;

  return { subject: layout.subject, html, text };
}

// ---------------------------------------------------------------------------
// Guest emails
// ---------------------------------------------------------------------------

export function paymentReceivedEmail(booking: BookingEmailContext, amount: number): Content {
  let next = 'Chủ nhà sẽ xác nhận đặt phòng của bạn sớm nhất và thông báo qua email.';
  if (booking.status === 'confirmed') next = 'Đặt phòng của bạn đã được xác nhận. Hẹn gặp bạn!';

  return render({
    subject: `Đã nhận thanh toán · ${booking.reference}`,
    heading: `Cảm ơn bạn, ${booking.customerName}`,
    paragraphs: [`Chúng tôi đã nhận ${formatVnd(amount)} cho đặt phòng ${booking.reference}.`, next],
    rows: bookingRows(booking),
    button: { label: 'Xem đặt phòng', url: lookupUrl(booking.reference) },
  });
}

export function bookingConfirmedEmail(booking: BookingEmailContext): Content {
  const remaining = booking.total - booking.amountPaid;
  const paragraphs = [`Chủ nhà đã xác nhận đặt phòng ${booking.reference}.`];
  if (remaining > 0) paragraphs.push(`Số tiền còn lại ${formatVnd(remaining)} thanh toán khi nhận phòng.`);

  return render({
    subject: `Đặt phòng đã được xác nhận · ${booking.reference}`,
    heading: 'Đặt phòng đã được xác nhận',
    paragraphs,
    rows: bookingRows(booking),
    button: { label: 'Xem đặt phòng', url: lookupUrl(booking.reference) },
  });
}

export function bookingCancelledEmail(booking: BookingEmailContext, reason: string): Content {
  const paragraphs = [`Đặt phòng ${booking.reference} đã được huỷ.`, `Lý do: ${reason}`];
  if (booking.amountPaid > 0) {
    paragraphs.push('Nếu bạn đủ điều kiện hoàn tiền, chúng tôi sẽ gửi email khi hoàn tiền được thực hiện.');
  }

  return render({
    subject: `Đặt phòng đã bị huỷ · ${booking.reference}`,
    heading: 'Đặt phòng đã bị huỷ',
    paragraphs,
    rows: bookingRows(booking),
  });
}

export function refundIssuedEmail(booking: BookingEmailContext, amount: number): Content {
  return render({
    subject: `Hoàn tiền ${formatVnd(amount)} · ${booking.reference}`,
    heading: 'Đã hoàn tiền',
    paragraphs: [
      `Chúng tôi đã hoàn ${formatVnd(amount)} cho đặt phòng ${booking.reference}.`,
      'Tuỳ ngân hàng hoặc ví điện tử, tiền có thể mất vài ngày làm việc để về tài khoản của bạn.',
    ],
    rows: bookingRows(booking),
  });
}

export function transferReportedEmail(booking: BookingEmailContext, transfer: TransferContext): Content {
  return render({
    subject: `Đã nhận thông báo chuyển khoản · ${booking.reference}`,
    heading: `Cảm ơn bạn, ${booking.customerName}`,
    paragraphs: [
      `Chúng tôi đã nhận thông báo bạn chuyển ${formatVnd(transfer.amount)} cho đặt phòng ${booking.reference}.`,
      'Chủ nhà sẽ kiểm tra tài khoản và xác nhận đặt phòng sớm nhất. Ngày của bạn được giữ trong thời gian này.',
    ],
    rows: bookingRows(booking),
    button: { label: 'Xem đặt phòng', url: lookupUrl(booking.reference) },
  });
}

export function transferNotReceivedEmail(booking: BookingEmailContext, reason: string, holdMinutes: number): Content {
  return render({
    subject: `Chưa nhận được chuyển khoản · ${booking.reference}`,
    heading: 'Chúng tôi chưa nhận được chuyển khoản',
    paragraphs: [
      `Chủ nhà chưa thấy khoản chuyển cho đặt phòng ${booking.reference}.`,
      `Ghi chú: ${reason}`,
      `Nếu bạn đã chuyển, vui lòng liên hệ chủ nhà kèm ảnh biên lai. Nếu chưa, bạn có ${holdMinutes} phút để chuyển khoản trước khi ngày được mở lại cho khách khác.`,
    ],
    rows: bookingRows(booking),
    button: { label: 'Xem đặt phòng', url: lookupUrl(booking.reference) },
  });
}

// ---------------------------------------------------------------------------
// Owner emails
// ---------------------------------------------------------------------------

export interface TransferContext {
  amount: number;
  note: string;
  bankName: string;
  accountNumber: string;
}

/** The guest says they transferred: the owner checks the bank account, then confirms in the admin. */
export function ownerTransferReportedEmail(booking: BookingEmailContext, transfer: TransferContext): Content {
  const rows: Rows = [
    ...bookingRows(booking),
    ['Khách', booking.customerName],
    ['Điện thoại', booking.customerPhone],
    ['Email', booking.customerEmail],
  ];
  if (booking.message) rows.push(['Lời nhắn', booking.message]);

  return render({
    subject: `[${booking.reference}] Khách báo đã chuyển ${formatVnd(transfer.amount)} · cần kiểm tra`,
    heading: 'Kiểm tra chuyển khoản',
    paragraphs: [
      `${booking.customerName} báo đã chuyển ${formatVnd(transfer.amount)} vào tài khoản ${transfer.bankName} ${transfer.accountNumber}, nội dung "${transfer.note}".`,
      'Hãy kiểm tra tài khoản ngân hàng, rồi bấm "Đã nhận tiền" (đặt phòng được xác nhận) hoặc "Chưa nhận được" trong trang quản lý. Ngày của khách được giữ cho đến khi bạn xử lý.',
    ],
    rows,
    button: { label: 'Mở đặt phòng', url: adminBookingUrl(booking.reference) },
  });
}

export interface ContactEmailContext {
  name: string;
  phone: string;
  email: string | null;
  topic: string;
  apartmentName: string | null;
  message: string;
}

export function ownerContactEmail(contact: ContactEmailContext): Content {
  const rows: Rows = [
    ['Họ tên', contact.name],
    ['Điện thoại', contact.phone],
    ['Email', contact.email ?? '—'],
    ['Chủ đề', contact.topic],
    ['Căn hộ', contact.apartmentName ?? '—'],
  ];
  return render({
    subject: `Tin nhắn mới: ${contact.topic} · ${contact.name}`,
    heading: 'Tin nhắn mới từ trang liên hệ',
    paragraphs: [contact.message],
    rows,
    button: { label: 'Mở hộp thư', url: `${env.siteUrl}/admin/messages` },
  });
}
