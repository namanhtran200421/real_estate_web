import { Injectable, computed, signal } from '@angular/core';
import { MAX_NIGHTS, nightsBetween, todayIso } from '../shared/dates';
import { readJson, removeItem, writeJson } from './browser-storage';

/** What the guest has entered across the booking steps, before the booking exists. */
export interface BookingDraft {
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  promoCode: string;
}

const STORAGE_KEY = 'booking-draft';
const CREATED_KEY = 'booking-draft-created';
const EMPTY: BookingDraft = {
  apartmentSlug: '',
  checkIn: '',
  checkOut: '',
  guests: 1,
  name: '',
  phone: '',
  email: '',
  message: '',
  promoCode: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^(\+84|0)\d{9,10}$/;

export type DraftErrors = Partial<Record<keyof BookingDraft, string>>;

/**
 * The booking form's state, shared by the "details" and "review" steps and kept in
 * sessionStorage so a refresh or the back button does not lose what the guest typed.
 */
@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  private readonly state = signal<BookingDraft>({ ...EMPTY, ...readJson<BookingDraft>('session', STORAGE_KEY) });

  readonly draft = this.state.asReadonly();

  /** Client-side checks, so the guest sees problems before anything is sent. */
  readonly errors = computed<DraftErrors>(() => {
    const draft = this.state();
    const errors: DraftErrors = {};
    if (!draft.checkIn) errors.checkIn = 'Chọn ngày nhận phòng trên lịch.';
    else if (draft.checkIn < todayIso()) errors.checkIn = 'Ngày nhận phòng đã qua, vui lòng chọn lại.';
    if (!draft.checkOut) errors.checkOut = 'Chọn ngày trả phòng trên lịch.';
    if (draft.checkIn && draft.checkOut) {
      const nights = nightsBetween(draft.checkIn, draft.checkOut);
      if (nights < 1) errors.checkOut = 'Ngày trả phòng phải sau ngày nhận phòng.';
      if (nights > MAX_NIGHTS) errors.checkOut = `Mỗi lần đặt tối đa ${MAX_NIGHTS} đêm.`;
    }
    if (!draft.name.trim()) errors.name = 'Nhập họ và tên.';
    if (!PHONE.test(draft.phone.replace(/[\s.-]/g, ''))) errors.phone = 'Số điện thoại không hợp lệ.';
    if (!EMAIL.test(draft.email.trim())) errors.email = 'Email không hợp lệ.';
    return errors;
  });

  readonly datesValid = computed(() => !this.errors().checkIn && !this.errors().checkOut);
  readonly complete = computed(() => Object.keys(this.errors()).length === 0);

  update(changes: Partial<BookingDraft>): void {
    this.state.update((draft) => ({ ...draft, ...changes }));
    writeJson('session', STORAGE_KEY, this.state());
  }

  /** Switching apartment keeps the guest's details but not a guest count the new one cannot take. */
  forApartment(slug: string, maxGuests: number): void {
    const draft = this.state();
    if (draft.apartmentSlug === slug && draft.guests <= maxGuests) return;
    this.update({ apartmentSlug: slug, guests: Math.min(Math.max(draft.guests, 1), maxGuests) });
  }

  /**
   * Remembers the booking created from the current draft, so going back and pressing
   * "continue" again reopens it instead of holding the same dates a second time.
   */
  rememberBooking(reference: string): void {
    writeJson('session', CREATED_KEY, { reference, fingerprint: this.fingerprint() });
  }

  /** Reference of the booking already created from exactly this draft, if any. */
  existingBooking(): string | undefined {
    const created = readJson<{ reference: string; fingerprint: string }>('session', CREATED_KEY);
    if (created?.fingerprint !== this.fingerprint()) return undefined;
    return created.reference;
  }

  clear(): void {
    this.state.set({ ...EMPTY });
    removeItem('session', STORAGE_KEY);
    removeItem('session', CREATED_KEY);
  }

  private fingerprint(): string {
    return JSON.stringify(this.state());
  }
}
