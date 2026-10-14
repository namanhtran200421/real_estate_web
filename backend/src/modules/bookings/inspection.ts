/**
 * The check-out inspection: the owner walks the apartment with a checklist and records what
 * they found. The refund of the security deposit waits for it (booking.service / payment.service).
 */

export type InspectionChecklist = { room: string; items: string[] }[];

export interface InspectionResult {
  room: string;
  item: string;
  ok: boolean;
  note: string | null;
}

/** Drafted from Sun Garden A04-12's amenities; the owner edits it per apartment. */
export const DEFAULT_INSPECTION_CHECKLIST: InspectionChecklist = [
  { room: 'Phòng khách', items: ['Sofa (giường sofa)', 'TV màn hình phẳng và điều khiển', 'Quạt trần', 'Bàn làm việc', 'Rèm cửa', 'Đèn'] },
  { room: 'Bếp', items: ['Bếp từ đôi', 'Máy hút mùi', 'Tủ lạnh', 'Ấm siêu tốc', 'Nồi, chảo, dụng cụ nấu ăn', 'Bộ bát đũa, ly', 'Bồn rửa và vòi nước'] },
  { room: 'Phòng ngủ 1', items: ['Giường và nệm', 'Chăn, ga, gối', 'Tủ quần áo và móc treo', 'Rèm cửa', 'Đèn'] },
  { room: 'Phòng ngủ 2', items: ['Giường và nệm', 'Chăn, ga, gối', 'Tủ quần áo và móc treo', 'Rèm cửa', 'Đèn'] },
  { room: 'Phòng tắm', items: ['Máy nóng lạnh', 'Vòi sen', 'Bồn cầu', 'Lavabo và gương', 'Khăn tắm'] },
  { room: 'Giặt phơi', items: ['Máy giặt / sấy', 'Giá phơi đồ'] },
  { room: 'Ban công', items: ['Cửa ban công và khoá', 'Lan can'] },
  { room: 'Chung', items: ['Chìa khoá / thẻ ra vào', 'Bộ phát Wi-Fi', 'Dép lê (4 đôi)', 'Quạt cây', 'Bình chữa cháy', 'Thiết bị báo cháy', 'Không có mùi khói thuốc', 'Rác đã được bỏ', 'Điện, nước đã tắt'] },
];

/** The apartment's own checklist, or the default while it has none. */
export function checklistFor(apartment: { inspectionChecklist: InspectionChecklist }): InspectionChecklist {
  return apartment.inspectionChecklist.length > 0 ? apartment.inspectionChecklist : DEFAULT_INSPECTION_CHECKLIST;
}

/**
 * Splits the held deposit across the payments it came from, the largest refundable first, so
 * the fewest refunds are made. Never plans more than a payment can still refund.
 */
export function depositRefundPlan(
  payments: { id: string; refundable: number }[],
  held: number,
): { paymentId: string; amount: number }[] {
  const plan: { paymentId: string; amount: number }[] = [];
  let left = held;
  for (const payment of [...payments].sort((a, b) => b.refundable - a.refundable)) {
    if (left <= 0) break;
    const amount = Math.min(payment.refundable, left);
    if (amount <= 0) continue;
    plan.push({ paymentId: payment.id, amount });
    left -= amount;
  }
  return plan;
}
