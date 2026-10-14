import { Injectable, computed, signal } from '@angular/core';
import { ForeignIdentity, GuestIdentity, VietnameseIdentity } from '../models/booking';

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

/** Sensitive identity drafts are deliberately memory-only: never session/local storage. */
@Injectable({ providedIn: 'root' })
export class GuestIdentityDraftService {
  private readonly state = signal<GuestIdentityDraft[]>([EMPTY()]);
  readonly identities = this.state.asReadonly();
  readonly errors = computed(() => this.state().map((identity) => this.validate(identity)));

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
        issueDate: identity.issueDate,
        expiryDate: identity.expiryDate,
        stayReason: identity.stayReason.trim(),
      };
      if (identity.nationalityChoice === 'VN') {
        return {
          ...common,
          documentType: 'cccd',
          nationality: 'VN',
          addressOnDocument: identity.addressOnDocument.trim(),
        } satisfies VietnameseIdentity;
      }
      return {
        ...common,
        documentType: 'passport',
        nationality: identity.nationality.trim(),
        gender: identity.gender as ForeignIdentity['gender'],
        temporaryStayExpiry: identity.temporaryStayExpiry,
      } satisfies ForeignIdentity;
    });
  }

  clear(): void {
    this.state.set([EMPTY()]);
  }

  private validate(identity: GuestIdentityDraft): IdentityErrors {
    const errors: IdentityErrors = {};
    if (!identity.fullName.trim()) errors.fullName = 'required';
    if (!identity.dateOfBirth) errors.dateOfBirth = 'required';
    if (!identity.issueDate) errors.issueDate = 'required';
    if (!identity.expiryDate) errors.expiryDate = 'required';
    if (identity.issueDate && identity.expiryDate && identity.expiryDate < identity.issueDate) errors.expiryDate = 'expiryBeforeIssue';
    if (!identity.stayReason.trim()) errors.stayReason = 'required';

    if (identity.nationalityChoice === 'VN') {
      if (!/^\d{12}$/.test(identity.documentNumber.trim())) errors.documentNumber = 'cccd';
      if (!identity.addressOnDocument.trim()) errors.addressOnDocument = 'required';
    } else {
      if (identity.documentNumber.trim().length < 5) errors.documentNumber = 'passport';
      if (!identity.nationality.trim()) errors.nationality = 'required';
      if (!identity.gender) errors.gender = 'required';
      if (!identity.temporaryStayExpiry) errors.temporaryStayExpiry = 'required';
    }
    return errors;
  }
}
