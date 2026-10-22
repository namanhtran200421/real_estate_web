/**
 * Password hashing with scrypt (built into Node, memory-hard, recommended by OWASP).
 *
 * Stored format: `scrypt$N$r$p$<salt base64>$<hash base64>`, so the cost parameters can be
 * raised later without invalidating existing passwords.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// OWASP's 32 MiB scrypt profile; p=3 raises CPU work without tripling per-hash memory.
const COST = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// scrypt needs 128 × N × r bytes; leave headroom above Node's 32 MiB default.
const MAX_MEMORY = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

// The passwords tried first by every guessing script (and their Vietnamese favourites). The CAPTCHA
// and rate limits slow guessing down; this keeps the first guesses from ever being right.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'qwerty', 'qwerty123',
  'qwertyuiop', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'abc123', 'abcd1234', 'iloveyou', 'admin', 'admin123',
  'administrator', 'welcome', 'welcome1', 'letmein', 'monkey', 'dragon', 'football', 'baseball', 'sunshine',
  'princess', 'trustno1', 'matkhau', 'matkhau123', 'anhyeuem', 'emyeuanh', 'vietnam', 'vietnam123',
  'hanoi', 'saigon', 'dalat', 'vnbookinghub', 'bookinghub', 'sungarden',
]);

/**
 * Why a new password is too weak, or null when it is acceptable. Pure, so the same rules can be
 * shown live on the account page and unit-tested.
 * @param email the account's email; its name part must not be the password
 */
export function passwordProblem(password: string, email: string): string | null {
  // Keep the existing raw-input cap used by login/current-password validation, so a new
  // password can always be submitted unchanged later even when NFKC compacts its characters.
  if (password.length > MAX_PASSWORD_LENGTH) return `Mật khẩu tối đa ${MAX_PASSWORD_LENGTH} ký tự.`;
  // Screen the same representation that derive() hashes, including its length and blocklist.
  password = password.normalize('NFKC');
  if (password.length < MIN_PASSWORD_LENGTH) return `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Mật khẩu tối đa ${MAX_PASSWORD_LENGTH} ký tự.`;

  const lower = password.toLowerCase();
  if (new Set(lower).size < 4) return 'Mật khẩu quá đơn giản: dùng nhiều ký tự khác nhau hơn.';
  // "Password2024!", "qwerty123456": a common password with digits or symbols tacked on.
  const core = lower.replace(/[^a-z]/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(core) || /^\d+$/.test(password)) {
    return 'Mật khẩu này quá phổ biến, dễ bị đoán. Hãy chọn mật khẩu khác.';
  }
  const name = email.normalize('NFKC').split('@')[0]?.toLowerCase() ?? '';
  if (name.length >= 4 && lower.includes(name)) return 'Mật khẩu không được chứa tên email của bạn.';
  return null;
}

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...options, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Upgrade legacy costs/salts after successful verification without downgrading stronger costs. */
export function needsPasswordRehash(stored: string): boolean {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  const cost = [Number(n), Number(r), Number(p)];
  if (algorithm !== 'scrypt' || cost.some((value) => !Number.isSafeInteger(value) || value < 1) || !salt || !hash) return true;
  const [memory, blockSize, parallelism] = cost;
  return memory * blockSize < COST.N * COST.r
    || memory * blockSize * parallelism < COST.N * COST.r * COST.p
    || Buffer.from(salt, 'base64').length < SALT_BYTES
    || Buffer.from(hash, 'base64').length < KEY_LENGTH;
}

/**
 * A valid hash of a random password. Login runs `verifyPassword` against it when the email is
 * unknown, avoiding a fast "account missing" path. Legacy costs can still differ during upgrade.
 */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
