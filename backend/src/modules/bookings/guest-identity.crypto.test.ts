import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GuestIdentity } from './booking.types.js';
import { decryptGuestIdentity, encryptGuestIdentity, identityKey } from './guest-identity.crypto.js';

const key = identityKey('test-only-identity-encryption-key-0123456789');
const bookingId = '6f1c2a8e-0000-4000-8000-000000000001';
const identity: GuestIdentity = {
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

describe('guest identity encryption', () => {
  it('decrypts what it encrypted, and never stores the document number in clear', () => {
    const payload = encryptGuestIdentity(identity, key, bookingId, 0);

    assert.doesNotMatch(payload, /001090000001|Hoàng/);
    assert.deepEqual(decryptGuestIdentity(payload, key, bookingId, 0), identity);
  });

  it('encrypts the same identity differently each time (random IV)', () => {
    assert.notEqual(encryptGuestIdentity(identity, key, bookingId, 0), encryptGuestIdentity(identity, key, bookingId, 0));
  });

  it('keeps a child identity without the optional fields', () => {
    const child: GuestIdentity = {
      documentType: 'cccd',
      nationality: 'VN',
      fullName: 'Hoàng Bé',
      dateOfBirth: '2016-05-01',
      documentNumber: '001216000003',
      stayReason: 'Du lịch',
    };
    assert.deepEqual(decryptGuestIdentity(encryptGuestIdentity(child, key, bookingId, 2), key, bookingId, 2), child);
  });

  it('refuses another booking id or guest index (the AAD binds the row)', () => {
    const payload = encryptGuestIdentity(identity, key, bookingId, 0);

    assert.throws(() => decryptGuestIdentity(payload, key, '6f1c2a8e-0000-4000-8000-000000000002', 0));
    assert.throws(() => decryptGuestIdentity(payload, key, bookingId, 1));
  });

  it('refuses another key', () => {
    const payload = encryptGuestIdentity(identity, key, bookingId, 0);

    assert.throws(() => decryptGuestIdentity(payload, identityKey('another-identity-encryption-key-0123456789'), bookingId, 0));
  });

  it('refuses a shortened authentication tag', () => {
    const [version, iv, tag, data] = encryptGuestIdentity(identity, key, bookingId, 0).split('.');
    const shortTag = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url');

    assert.throws(() => decryptGuestIdentity([version, iv, shortTag, data].join('.'), key, bookingId, 0));
  });
});
