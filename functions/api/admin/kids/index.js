// GET  /api/admin/kids?household_id=&all=1
// POST /api/admin/kids  { household_id, name, birth_year?, emoji?, color?, ui_mode? }
import { newId } from '../../../../lib/crypto.js';
import { getKid, listKids } from '../../../../lib/db.js';
import { json, readJson, requireInt, requireString } from '../../../../lib/http.js';
import { validateKidFields } from './_validate.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const kids = await listKids(env.DB, {
    householdId: url.searchParams.get('household_id'),
    includeInactive: url.searchParams.get('all') === '1',
  });
  return json({ kids });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const householdId = requireString(body.household_id, 'household_id');
  const name = requireString(body.name, 'name', { max: 40 });
  const f = validateKidFields(body);
  const sort = requireInt(body.sort, 'sort', { min: 0, max: 999, optional: true }) ?? 0;
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO kids (id, household_id, name, birth_year, emoji, color, ui_mode, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, householdId, name, f.birth_year ?? null, f.emoji ?? null, f.color ?? null, f.ui_mode ?? 'picture', sort).run();
  return json({ kid: await getKid(env.DB, id) }, 201);
}
