import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildVietQrPayload, crc16 } from './vietqr.js';

// Decoded from the owner's static Vietcombank VietQR (DO HOANG HAI, 6969888821).
const OWNER_STATIC_QR =
  '00020101021138540010A00000072701240006970436011069698888210208QRIBFTTA53037045802VN6304DB5A';

describe('VietQR', () => {
  it('reproduces the bank-issued static QR exactly, checksum included', () => {
    assert.equal(buildVietQrPayload({ bin: '970436', accountNumber: '6969888821' }), OWNER_STATIC_QR);
  });

  it('builds a dynamic QR with amount and transfer note', () => {
    const payload = buildVietQrPayload({ bin: '970436', accountNumber: '6969888821', amount: 1_539_000, note: 'RE2611K7Q3M' });
    assert.ok(payload.startsWith('000201010212'), 'dynamic point of initiation');
    assert.ok(payload.includes('54071539000'), 'amount');
    assert.ok(payload.includes('5802VN62150811RE2611K7Q3M6304'), 'note in additional data');
    assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
  });

  it('computes CRC-16/CCITT-FALSE', () => {
    // Standard check value for "123456789".
    assert.equal(crc16('123456789'), '29B1');
  });
});
