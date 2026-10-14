import { query, queryOne, type Db } from '../../db/pool.js';
import type {
  AdminAssetIncident,
  AssetIncidentStatus,
  BookingFinancials,
  GuestAssetIncident,
} from './booking.types.js';

interface IncidentRow {
  id: string;
  description: string;
  amount: number;
  security_applied: number;
  status: AssetIncidentStatus;
  created_by: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

function toIncident(row: IncidentRow): AdminAssetIncident {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount,
    securityApplied: row.security_applied,
    status: row.status,
    createdBy: row.created_by,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

async function list(bookingId: string, db?: Db): Promise<AdminAssetIncident[]> {
  const rows = await query<IncidentRow>(
    `SELECT i.id, i.description, i.amount, i.security_applied, i.status,
            creator.email AS created_by, resolver.email AS resolved_by, i.resolved_at, i.created_at
     FROM booking_asset_incidents i
     LEFT JOIN admin_users creator ON creator.id = i.created_by
     LEFT JOIN admin_users resolver ON resolver.id = i.resolved_by
     WHERE i.booking_id = $1 ORDER BY i.created_at`,
    [bookingId],
    db,
  );
  return rows.map(toIncident);
}

async function financials(bookingId: string, securityRequired: number, db?: Db): Promise<BookingFinancials> {
  const row = await queryOne<{
    security_received: number;
    security_refunded: number;
    security_applied: number;
    incident_charges: number;
    incident_received: number;
    incident_refunded: number;
  }>(
    `SELECT
       (SELECT coalesce(sum(amount), 0)::int FROM payments
        WHERE booking_id = $1 AND purpose = 'asset_security' AND state = 'succeeded') AS security_received,
       (SELECT coalesce(sum(r.amount), 0)::int FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE p.booking_id = $1 AND p.purpose = 'asset_security' AND r.state = 'succeeded') AS security_refunded,
       (SELECT coalesce(sum(security_applied), 0)::int FROM booking_asset_incidents
        WHERE booking_id = $1 AND status <> 'waived') AS security_applied,
       (SELECT coalesce(sum(amount), 0)::int FROM booking_asset_incidents
        WHERE booking_id = $1 AND status <> 'waived') AS incident_charges,
       (SELECT coalesce(sum(amount), 0)::int FROM payments
        WHERE booking_id = $1 AND purpose = 'incident' AND state = 'succeeded') AS incident_received,
       (SELECT coalesce(sum(r.amount), 0)::int FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE p.booking_id = $1 AND p.purpose = 'incident' AND r.state = 'succeeded') AS incident_refunded`,
    [bookingId],
    db,
  );
  const values = row!;
  const incidentPayments = values.incident_received - values.incident_refunded;
  return {
    assetSecurityRequired: securityRequired,
    assetSecurityReceived: values.security_received,
    assetSecurityRefunded: values.security_refunded,
    assetSecurityApplied: values.security_applied,
    assetSecurityHeld: Math.max(values.security_received - values.security_refunded - values.security_applied, 0),
    assetSecurityDue: Math.max(securityRequired - values.security_received, 0),
    incidentCharges: values.incident_charges,
    incidentPayments,
    incidentAmountDue: Math.max(values.incident_charges - values.security_applied - incidentPayments, 0),
  };
}

async function insert(
  input: { bookingId: string; description: string; amount: number; securityApplied: number; createdBy: string },
  db: Db,
): Promise<void> {
  await query(
    `INSERT INTO booking_asset_incidents (booking_id, description, amount, security_applied, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.bookingId, input.description, input.amount, input.securityApplied, input.createdBy],
    db,
  );
}

async function setStatus(
  bookingId: string,
  incidentId: string,
  status: Exclude<AssetIncidentStatus, 'open'>,
  adminId: string,
  db: Db,
): Promise<boolean> {
  const rows = await query(
    `UPDATE booking_asset_incidents
     SET status = $3::asset_incident_status, security_applied = CASE WHEN $3::text = 'waived' THEN 0 ELSE security_applied END,
         resolved_by = $4, resolved_at = now()
     WHERE id = $2 AND booking_id = $1 AND status = 'open'
     RETURNING id`,
    [bookingId, incidentId, status, adminId],
    db,
  );
  return rows.length > 0;
}

function toGuest(incident: AdminAssetIncident): GuestAssetIncident {
  const { createdBy: _createdBy, resolvedBy: _resolvedBy, resolvedAt: _resolvedAt, ...guest } = incident;
  return guest;
}

export const assetIncidentRepository = { list, financials, insert, setStatus, toGuest };
