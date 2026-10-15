import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ageOn, guestIdentityIssues, guestIdentitySchema } from './guest-identity.schema.js';

const TODAY = '2026-10-15';
const CHECK_IN = '2026-11-01';

const adult = {
  documentType: 'cccd',
  nationality: 'VN',
  fullName: 'Hoàng Hải',
  dateOfBirth: '1990-01-01',
  documentNumber: '001090000001',
  addressOnDocument: 'Hà Nội',
  issueDate: '2021-01-01',
  expiryDate: '2031-01-01',
  stayReason: 'Du lịch',
};

/** Parses one identity, then runs the checks that need the stay: the issues found, by path. */
function check(identity: object, checkIn = CHECK_IN): Record<string, string> {
  const parsed = guestIdentitySchema.safeParse(identity);
  if (!parsed.success) {
    return Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
  }
  return Object.fromEntries(guestIdentityIssues([parsed.data], checkIn, TODAY).map((issue) => [issue.path.join('.'), issue.message]));
}

describe('guest identity checks', () => {
  it('accepts a 10-year-old Vietnamese guest with only name, date of birth and personal ID number', () => {
    const child = {
      documentType: 'cccd',
      nationality: 'VN',
      fullName: 'Hoàng Bé',
      dateOfBirth: '2016-05-01',
      documentNumber: '001216000003',
      stayReason: 'Du lịch',
    };

    assert.deepEqual(check(child), {});
    assert.deepEqual(check({ ...child, issueDate: '', expiryDate: '', addressOnDocument: '' }), {}, 'blank counts as absent');
  });

  it('still needs the 12-digit number for a child', () => {
    const issues = check({ documentType: 'cccd', nationality: 'VN', fullName: 'Hoàng Bé', dateOfBirth: '2016-05-01', documentNumber: '123', stayReason: 'Du lịch' });

    assert.ok(issues['documentNumber']);
  });

  it('refuses an adult without the issue date, expiry date or address', () => {
    const { issueDate: _issue, expiryDate: _expiry, addressOnDocument: _address, ...withoutDates } = adult;

    assert.deepEqual(Object.keys(check(withoutDates)).sort(), [
      'guestIdentities.0.addressOnDocument',
      'guestIdentities.0.expiryDate',
      'guestIdentities.0.issueDate',
    ]);
    assert.deepEqual(Object.keys(check({ ...adult, issueDate: undefined })), ['guestIdentities.0.issueDate']);
  });

  it('counts the age on the check-in date: 14 on the birthday', () => {
    const turning14 = { ...adult, dateOfBirth: '2012-11-01', issueDate: undefined, expiryDate: undefined, addressOnDocument: undefined };

    assert.ok(Object.keys(check(turning14, '2026-11-01')).length > 0, '14 on check-in day: an adult document');
    assert.deepEqual(check(turning14, '2026-10-31'), {}, 'still 13 the day before');
    assert.equal(ageOn('2012-02-29', '2026-02-28'), 13);
    assert.equal(ageOn('2012-02-29', '2026-03-01'), 14);
  });

  it('refuses a date of birth that is not in the past', () => {
    assert.ok(check({ ...adult, dateOfBirth: TODAY })['guestIdentities.0.dateOfBirth']);
    assert.ok(check({ ...adult, dateOfBirth: '2026-10-20' })['guestIdentities.0.dateOfBirth']);
  });

  it('refuses an expiry date on or before the issue date', () => {
    assert.ok(check({ ...adult, expiryDate: adult.issueDate })['guestIdentities.0.expiryDate']);
    assert.ok(check({ ...adult, issueDate: '2031-01-02' })['guestIdentities.0.expiryDate']);
  });

  it('refuses a document that has expired by check-in day, but takes one expiring that day', () => {
    assert.ok(check({ ...adult, expiryDate: '2026-10-31' })['guestIdentities.0.expiryDate']);
    assert.deepEqual(check({ ...adult, expiryDate: CHECK_IN }), {});
  });

  it('applies the same date checks to passports', () => {
    const passport = {
      documentType: 'passport',
      nationality: 'Korea',
      gender: 'female',
      fullName: 'Kim Min',
      dateOfBirth: '1995-03-03',
      documentNumber: 'M1234567',
      issueDate: '2020-01-01',
      expiryDate: '2026-10-20',
      temporaryStayExpiry: '2026-12-01',
      stayReason: 'Du lịch',
    };

    assert.ok(check(passport)['guestIdentities.0.expiryDate'], 'expired before check-in');
    assert.ok(check({ ...passport, issueDate: undefined })['issueDate'], 'passport dates stay required, child or not');
  });
});
