/**
 * Contact form messages data access.
 */
import { query, queryOne, type Db } from '../../db/pool.js';
import type { ContactMessage, NewContactMessage } from './contact.types.js';

async function insert(message: NewContactMessage, apartmentId: string | null, ip: string | undefined, db: Db): Promise<void> {
  await query(
    `INSERT INTO contact_messages (name, phone, email, topic, apartment_id, message, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [message.name, message.phone, message.email ?? null, message.topic, apartmentId, message.message, ip ?? null],
    db,
  );
}

async function list(options: { unhandledOnly: boolean; limit: number; offset: number }): Promise<{ items: ContactMessage[]; total: number }> {
  let where = '';
  if (options.unhandledOnly) where = 'WHERE m.handled_at IS NULL';

  const rows = await query<ContactMessage & { total: number }>(
    `SELECT m.id, m.name, m.phone, m.email, m.topic, a.name AS "apartmentName", m.message,
            m.handled_at AS "handledAt", m.created_at AS "createdAt", count(*) OVER ()::int AS total
     FROM contact_messages m LEFT JOIN apartments a ON a.id = m.apartment_id
     ${where}
     ORDER BY m.created_at DESC
     LIMIT $1 OFFSET $2`,
    [options.limit, options.offset],
  );
  return { items: rows.map(({ total: _total, ...message }) => message), total: rows[0]?.total ?? 0 };
}

async function setHandled(id: string, handled: boolean): Promise<boolean> {
  const row = await queryOne(
    `UPDATE contact_messages SET handled_at = CASE WHEN $2 THEN now() END WHERE id = $1 RETURNING id`,
    [id, handled],
  );
  return row !== undefined;
}

export const contactRepository = { insert, list, setHandled };
