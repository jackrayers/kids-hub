// POST /api/pair  { code }  →  { token, household }
// A tablet trades a short-lived pairing code for a long-lived device token.
import { newId, randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError, json, readJson, requireString } from '../../lib/http.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const code = requireString(body.code, 'code', { max: 12 }).toUpperCase().replace(/[^A-Z0-9]/g, '');

  const pc = await env.DB.prepare(
    `SELECT * FROM pairing_codes WHERE code = ? AND used_at IS NULL AND expires_at > datetime('now')`,
  ).bind(code).first();
  if (!pc) throw new HttpError(400, 'That code didn’t work. Ask a grown-up for a new one.');

  const token = randomToken();
  const deviceId = newId();
  const results = await env.DB.batch([
    // Guarded update so two simultaneous redemptions can't both succeed.
    env.DB.prepare(`UPDATE pairing_codes SET used_at = datetime('now') WHERE code = ? AND used_at IS NULL`).bind(code),
    env.DB.prepare(
      `INSERT INTO devices (id, household_id, kid_id, name, token_hash, created_by)
       SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(deviceId, pc.household_id, pc.kid_id, pc.device_name, await sha256Hex(token), pc.created_by),
  ]);
  if (!results[1].meta.changes) throw new HttpError(400, 'That code was already used.');

  const household = await env.DB.prepare('SELECT id, name FROM households WHERE id = ?').bind(pc.household_id).first();
  return json({ token, device: { id: deviceId, name: pc.device_name }, household }, 201);
}
