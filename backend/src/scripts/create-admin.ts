/**
 * Creates an admin account and prints a generated password once.
 *
 * Usage: npm run admin:create -- owner@example.com "Owner Name"
 *        (production: npm run admin:create:prod -- …, after `npm run build`)
 *
 * The owner signs in with the printed password and can change it from the admin area.
 */
import { randomBytes } from 'node:crypto';
import { closePool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { adminAuthService } from '../modules/admin-auth/admin-auth.service.js';

const [email, name] = process.argv.slice(2);

try {
  if (!email || !name) throw new Error('Usage: npm run admin:create -- <email> "<name>"');

  const password = randomBytes(12).toString('base64url');
  const admin = await adminAuthService.createAdmin(email.toLowerCase(), name, password);

  // Printed to the terminal only, never to the log stream.
  process.stdout.write(`\nAdmin created: ${admin.email}\nPassword:      ${password}\n\nChange it after the first sign-in.\n\n`);
} catch (error) {
  logger.error('Could not create admin', { error });
  process.exitCode = 1;
} finally {
  await closePool();
}
