// GET   /api/admin/kids/:id
// PATCH /api/admin/kids/:id  { name?, household_id?, birth_year?, emoji?, color?, ui_mode?, active?, sort? }
import { getKid } from '../../../../../lib/db.js';
import { json, readJson, requireInt, requireString } from '../../../../../lib/http.js';
import { validateKidFields } from '../_validate.js';

export async function onRequestGet({ env, params }) {
  return json({ kid: await getKid(env.DB, params.id) });
}

export async function onRequestPatch({ request, env, params }) {
  await getKid(env.DB, params.id); // 404 if missing
  const body = await readJson(request);
  const fields = validateKidFields(body);
  if ('name' in body) fields.name = requireString(body.name, 'name', { max: 40 });
  if ('household_id' in body) fields.household_id = requireString(body.household_id, 'household_id');
  if ('active' in body) fields.active = body.active ? 1 : 0;
  if ('sort' in body) fields.sort = requireInt(body.sort, 'sort', { min: 0, max: 999 });

  const keys = Object.keys(fields);
  if (keys.length) {
    await env.DB.prepare(`UPDATE kids SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .bind(...keys.map((k) => fields[k]), params.id).run();
  }
  return json({ kid: await getKid(env.DB, params.id) });
}
