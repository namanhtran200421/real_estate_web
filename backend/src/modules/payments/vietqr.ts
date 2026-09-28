/**
 * VietQR (NAPAS 247) payment codes.
 *
 * Builds the EMVCo "merchant-presented" payload that every Vietnamese banking app understands.
 * With an amount and a transfer note, the guest's app fills in the account, the exact amount
 * and the booking reference; the guest only confirms.
 *
 * Payload (Tag-Length-Value):
 *   00 "01"                      payload format
 *   01 "11" static | "12" dynamic (one-off: has an amount)
 *   38 NAPAS merchant account:
 *        00 "A000000727"          NAPAS GUID
 *        01 beneficiary: 00 bank BIN, 01 account number
 *        02 "QRIBFTTA"            service: inter-bank transfer to an account
 *   53 "704"                     currency: VND
 *   54 amount                    (dynamic only)
 *   58 "VN"                      country
 *   62 additional data: 08 transfer note
 *   63 CRC-16/CCITT-FALSE over everything before it, including "6304"
 */

export interface VietQrInput {
  /** Bank identification number, e.g. 970436 (Vietcombank). */
  bin: string;
  accountNumber: string;
  amount?: number;
  /** Transfer note shown in both bank statements; letters and digits, at most 25. */
  note?: string;
}

const NAPAS_GUID = 'A000000727';
const TRANSFER_TO_ACCOUNT = 'QRIBFTTA';
const MAX_NOTE_LENGTH = 25;

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo requires. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildVietQrPayload(input: VietQrInput): string {
  const beneficiary = field('00', input.bin) + field('01', input.accountNumber);
  const merchantAccount = field('00', NAPAS_GUID) + field('01', beneficiary) + field('02', TRANSFER_TO_ACCOUNT);

  let initiation = '11';
  if (input.amount !== undefined) initiation = '12';

  let payload = field('00', '01') + field('01', initiation) + field('38', merchantAccount) + field('53', '704');
  if (input.amount !== undefined) payload += field('54', String(input.amount));
  payload += field('58', 'VN');
  if (input.note) payload += field('62', field('08', input.note.slice(0, MAX_NOTE_LENGTH)));

  const withCrcTag = `${payload}6304`;
  return withCrcTag + crc16(withCrcTag);
}
