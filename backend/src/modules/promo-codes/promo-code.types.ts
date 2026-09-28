/**
 * Promo code shapes. A code gives either a percentage or a fixed amount off a stay.
 */
export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number | null;
  discountAmount: number | null;
  /** How many active bookings may use it; the site tells guests "each code works once" (default 1). */
  maxRedemptions: number;
  minNights: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  /** Pending, confirmed and completed bookings currently using the code. */
  redemptions: number;
  createdAt: string;
}

export interface PromoCodeInput {
  code: string;
  description?: string;
  discountPercent?: number;
  discountAmount?: number;
  maxRedemptions: number;
  minNights: number;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
}
