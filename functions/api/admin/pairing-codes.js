// POST /api/admin/pairing-codes  { household_id, device_name } → { code, expires_at }
import { pairingCode } from '../../../lib/crypto.js';
import { HttpError, json, readJson, requireString } from '../../../lib/http.js';

const TTL_MINUTES = 10;

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  const householdId = requireString(body.household_id, 'household_id');
  const deviceName = requireString(body.device_name, 'device_name', { max: 40 });
  const household = await env.DB.prepare('SELECT id FROM households WHERE id = ?').bind(householdId).first();
  if (!household) throw new HttpError(404, 'Household not found');

  await env.DB.prepare(`DELETE FROM pairing_codes WHERE expires_at < datetime('now', '-1 day')`).run();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = pairingCode();
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO pairing_codes (code, household_id, device_name, created_by, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '+${TTL_MINUTES} minutes'))`,
    ).bind(code, householdId, deviceName, data.adult.email).run();
    if (res.meta.changes) {
      const row = await env.DB.prepare('SELECT code, expires_at FROM pairing_codes WHERE code = ?').bind(code).first();
      return json({ code: row.code, expires_at: row.expires_at.replace(' ', 'T') + 'Z', ttl_minutes: TTL_MINUTES }, 201);
    }
  }
  throw new HttpError(500, 'Could not create a code, try again');
}
