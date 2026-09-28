/**
 * Password hashing with scrypt (built into Node, memory-hard, recommended by OWASP).
 *
 * Stored format: `scrypt$N$r$p$<salt base64>$<hash base64>`, so the cost parameters can be
 * raised later without invalidating existing passwords.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// scrypt needs 128 × N × r bytes; leave headroom above Node's 32 MiB default.
const MAX_MEMORY = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 10;

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

/**
 * A valid hash of a random password. Login runs `verifyPassword` against it when the email is
 * unknown, so the response time does not reveal which emails have accounts.
 */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
