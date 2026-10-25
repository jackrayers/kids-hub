// GET  /api/admin/households
// POST /api/admin/households  { name }
import { newId } from '../../../../lib/crypto.js';
import { json, readJson, requireString } from '../../../../lib/http.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`SELECT h.*,
      (SELECT COUNT(*) FROM kids k WHERE k.household_id = h.id AND k.active = 1 AND k.deleted_at IS NULL) AS kid_count,
      (SELECT COUNT(*) FROM devices d WHERE d.household_id = h.id AND d.revoked_at IS NULL) AS device_count
    FROM households h ORDER BY h.created_at`).all();
  return json({ households: results });
}

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  const id = newId();
  const name = requireString(body.name, 'name', { max: 60 });
  await env.DB.prepare('INSERT INTO households (id, name) VALUES (?, ?)').bind(id, name).run();

  // First household becomes the creator's default.
  if (!data.adult.household_id) {
    await env.DB.prepare('UPDATE adults SET household_id = ? WHERE email = ?').bind(id, data.adult.email).run();
  }
  return json({ household: { id, name } }, 201);
}
