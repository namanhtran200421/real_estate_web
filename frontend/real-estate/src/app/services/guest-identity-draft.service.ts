import { Injectable, computed, signal } from '@angular/core';
import { ForeignIdentity, GuestIdentity, VietnameseIdentity } from '../models/booking';
import { ageOn, todayIso } from '../shared/dates';

/**
 * Vietnamese guests younger than this on check-in day give only name, date of birth and the
 * 12-digit personal ID number; the issue date, expiry date and address are optional for them
 * (the API checks the same: backend guest-identity.schema.ts).
 */
export const CHILD_AGE = 14;

export type NationalityChoice = 'VN' | 'foreign';
export type IdentityField =
  | 'fullName'
  | 'dateOfBirth'
  | 'documentNumber'
  | 'addressOnDocument'
  | 'issueDate'
  | 'expiryDate'
  | 'nationality'
  | 'gender'
  | 'temporaryStayExpiry'
  | 'stayReason';

export interface GuestIdentityDraft {
  nationalityChoice: NationalityChoice;
  fullName: string;
  dateOfBirth: string;
  documentNumber: string;
  addressOnDocument: string;
  issueDate: string;
  expiryDate: string;
  nationality: string;
  gender: '' | 'female' | 'male' | 'other';
  temporaryStayExpiry: string;
  stayReason: string;
}

export type IdentityErrors = Partial<Record<IdentityField, string>>;

const EMPTY = (): GuestIdentityDraft => ({
  nationalityChoice: 'VN',
  fullName: '',
  dateOfBirth: '',
  documentNumber: '',
  addressOnDocument: '',
  issueDate: '',
  expiryDate: '',
  nationality: '',
  gender: '',
  temporaryStayExpiry: '',
  stayReason: '',
});

/** A Vietnamese guest under 14 on check-in day; false until the date of birth and check-in are known. */
function isChild(identity: GuestIdentityDraft, checkIn: string): boolean {
  return identity.nationalityChoice === 'VN' && !!identity.dateOfBirth && !!checkIn && ageOn(identity.dateOfBirth, checkIn) < CHILD_AGE;
}

/** Sensitive identity drafts are deliberately memory-only: never session/local storage. */
@Injectable({ providedIn: 'root' })
export class GuestIdentityDraftService {
  private readonly state = signal<GuestIdentityDraft[]>([EMPTY()]);
  /** The stay's check-in date: whether a guest is a child, and whether a document is still valid, depend on it. */
  private readonly checkIn = signal('');
  readonly identities = this.state.asReadonly();
  /** Per guest: a Vietnamese child, whose issue date, expiry date and address are optional. */
  readonly children = computed(() => this.state().map((identity) => isChild(identity, this.checkIn())));
  readonly errors = computed(() => this.state().map((identity) => this.validate(identity, this.checkIn())));

  /** The check-in date of the stay being booked. */
  forStay(checkIn: string): void {
    this.checkIn.set(checkIn);
  }

  resize(count: number, primaryName: string): void {
    this.state.update((current) => {
      const next = current.slice(0, count);
      while (next.length < count) next.push(EMPTY());
      if (next[0] && !next[0].fullName.trim() && primaryName.trim()) next[0] = { ...next[0], fullName: primaryName.trim() };
      return next;
    });
  }

  update(index: number, changes: Partial<GuestIdentityDraft>): void {
    this.state.update((current) => current.map((item, position) => (position === index ? { ...item, ...changes } : item)));
  }

  complete(count: number): boolean {
    return this.state().length === count && this.errors().every((errors) => Object.keys(errors).length === 0);
  }

  payload(): GuestIdentity[] {
    return this.state().map((identity): GuestIdentity => {
      const common = {
        fullName: identity.fullName.trim(),
        dateOfBirth: identity.dateOfBirth,
        documentNumber: identity.documentNumber.trim().toUpperCase(),
        stayReason: identity.stayReason.trim(),
      };
      if (identity.nationalityChoice === 'VN') {
        // A child may leave these out: blank fields are not sent.
        const vietnamese: VietnameseIdentity = { ...common, documentType: 'cccd', nationality: 'VN' };
        const address = identity.addressOnDocument.trim();
        if (address) vietnamese.addressOnDocument = address;
        if (identity.issueDate) vietnamese.issueDate = identity.issueDate;
        if (identity.expiryDate) vietnamese.expiryDate = identity.expiryDate;
        return vietnamese;
      }
      return {
        ...common,
        documentType: 'passport',
        nationality: identity.nationality.trim(),
        gender: identity.gender as ForeignIdentity['gender'],
        issueDate: identity.issueDate,
        expiryDate: identity.expiryDate,
        temporaryStayExpiry: identity.temporaryStayExpiry,
      } satisfies ForeignIdentity;
    });
  }

  clear(): void {
    this.state.set([EMPTY()]);
  }

  /** The same checks as the API's, so the guest never meets them only after pressing "Book". */
  private validate(identity: GuestIdentityDraft, checkIn: string): IdentityErrors {
    const errors: IdentityErrors = {};
    const child = isChild(identity, checkIn);
    if (!identity.fullName.trim()) errors.fullName = 'required';
    if (!identity.dateOfBirth) errors.dateOfBirth = 'required';
    else if (identity.dateOfBirth >= todayIso()) errors.dateOfBirth = 'dateOfBirthPast';
    if (!identity.issueDate && !child) errors.issueDate = 'required';
    if (!identity.expiryDate && !child) errors.expiryDate = 'required';
    if (identity.issueDate && identity.expiryDate && identity.expiryDate <= identity.issueDate) errors.expiryDate = 'expiryBeforeIssue';
    else if (identity.expiryDate && checkIn && identity.expiryDate < checkIn) errors.expiryDate = 'documentExpired';
    if (!identity.stayReason.trim()) errors.stayReason = 'required';

    if (identity.nationalityChoice === 'VN') {
      if (!/^\d{12}$/.test(identity.documentNumber.trim())) errors.documentNumber = 'cccd';
      if (!identity.addressOnDocument.trim() && !child) errors.addressOnDocument = 'required';
    } else {
      if (identity.documentNumber.trim().length < 5) errors.documentNumber = 'passport';
      if (!identity.nationality.trim()) errors.nationality = 'required';
      if (!identity.gender) errors.gender = 'required';
      if (!identity.temporaryStayExpiry) errors.temporaryStayExpiry = 'required';
    }
    return errors;
  }
}
