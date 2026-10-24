// GET  /api/admin/adults
// POST /api/admin/adults  { email, name?, household_id? }   (owner only)
// Adding someone here AND to the Cloudflare Access policy lets them sign in.
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';

export function requireOwner(adult) {
  if (adult.role !== 'owner') throw new HttpError(403, 'Only the owner can do that');
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`SELECT a.*, h.name AS household_name
    FROM adults a LEFT JOIN households h ON h.id = a.household_id
    ORDER BY a.role = 'owner' DESC, a.created_at`).all();
  return json({ adults: results });
}

export async function onRequestPost({ request, env, data }) {
  requireOwner(data.adult);
  const body = await readJson(request);
  const email = requireString(body.email, 'email', { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'That doesn’t look like an email');
  const name = requireString(body.name, 'name', { max: 60, optional: true });
  const householdId = requireString(body.household_id, 'household_id', { optional: true });
  await env.DB.prepare(`INSERT INTO adults (email, name, household_id) VALUES (?, ?, ?)`)
    .bind(email, name, householdId).run();
  return json({ adult: { email, name, household_id: householdId, role: 'adult' } }, 201);
}
