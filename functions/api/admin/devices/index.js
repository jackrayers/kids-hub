// GET /api/admin/devices → paired tablets (active first).
import { json } from '../../../../lib/http.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`SELECT d.id, d.name, d.household_id, h.name AS household_name,
      d.created_by, d.created_at, d.last_seen, d.revoked_at
    FROM devices d JOIN households h ON h.id = d.household_id
    ORDER BY d.revoked_at IS NOT NULL, d.created_at DESC`).all();
  return json({ devices: results });
}
