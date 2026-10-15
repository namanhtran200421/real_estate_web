import { addDaysIso, todayIso } from '../shared/dates';
import { GuestIdentityDraft, GuestIdentityDraftService } from './guest-identity-draft.service';

// Mid-June next year: every birthday below is a real date.
const year = Number(todayIso().slice(0, 4)) + 1;
const CHECK_IN = `${year}-06-15`;

const ADULT: Partial<GuestIdentityDraft> = {
  nationalityChoice: 'VN',
  fullName: 'Hoàng Hải',
  dateOfBirth: '1990-01-01',
  documentNumber: '001090000001',
  addressOnDocument: 'Hà Nội',
  issueDate: '2021-01-01',
  expiryDate: `${year + 5}-01-01`,
  stayReason: 'Du lịch',
};

function service(identity: Partial<GuestIdentityDraft>): GuestIdentityDraftService {
  const drafts = new GuestIdentityDraftService();
  drafts.forStay(CHECK_IN);
  drafts.update(0, identity);
  return drafts;
}

describe('GuestIdentityDraftService', () => {
  it('accepts a 10-year-old Vietnamese guest with only name, date of birth and personal ID number', () => {
    const drafts = service({
      fullName: 'Hoàng Bé',
      dateOfBirth: `${year - 10}-01-01`,
      documentNumber: '001216000003',
      stayReason: 'Du lịch',
    });

    expect(drafts.children()).toEqual([true]);
    expect(drafts.errors()[0]).toEqual({});
    expect(drafts.complete(1)).toBe(true);
    const [child] = drafts.payload();
    expect(child).toEqual({
      documentType: 'cccd',
      nationality: 'VN',
      fullName: 'Hoàng Bé',
      dateOfBirth: `${year - 10}-01-01`,
      documentNumber: '001216000003',
      stayReason: 'Du lịch',
    });
  });

  it('refuses an adult without an issue date', () => {
    const drafts = service({ ...ADULT, issueDate: '' });

    expect(drafts.children()).toEqual([false]);
    expect(drafts.errors()[0]).toEqual({ issueDate: 'required' });
    expect(drafts.complete(1)).toBe(false);
  });

  it('counts the age on check-in day: 14 on the birthday is an adult', () => {
    const turning14 = `${year - 14}-06-15`;
    expect(service({ ...ADULT, dateOfBirth: turning14, issueDate: '' }).errors()[0]).toEqual({ issueDate: 'required' });
    expect(service({ ...ADULT, dateOfBirth: addDaysIso(turning14, 1), issueDate: '' }).errors()[0]).toEqual({});
  });

  it('checks the dates as the server does', () => {
    expect(service({ ...ADULT, dateOfBirth: todayIso() }).errors()[0]).toEqual({ dateOfBirth: 'dateOfBirthPast' });
    expect(service({ ...ADULT, expiryDate: ADULT.issueDate }).errors()[0]).toEqual({ expiryDate: 'expiryBeforeIssue' });
    expect(service({ ...ADULT, expiryDate: addDaysIso(CHECK_IN, -1) }).errors()[0]).toEqual({ expiryDate: 'documentExpired' });
    expect(service({ ...ADULT, expiryDate: CHECK_IN }).errors()[0]).toEqual({});
  });

  it('keeps passport details required for a foreign child', () => {
    const drafts = service({
      nationalityChoice: 'foreign',
      fullName: 'Kim Min',
      dateOfBirth: `${year - 10}-01-01`,
      documentNumber: 'M1234567',
      nationality: 'Korea',
      gender: 'female',
      temporaryStayExpiry: CHECK_IN,
      stayReason: 'Du lịch',
    });

    expect(drafts.children()).toEqual([false]);
    expect(drafts.errors()[0]).toEqual({ issueDate: 'required', expiryDate: 'required' });
  });
});
