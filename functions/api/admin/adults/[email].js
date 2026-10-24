// PATCH  /api/admin/adults/:email  { name?, household_id? }  (self, or owner for anyone)
// DELETE /api/admin/adults/:email                             (owner only, not self)
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';
import { requireOwner } from './index.js';

export async function onRequestPatch({ request, env, data, params }) {
  const email = decodeURIComponent(params.email).toLowerCase();
  if (email !== data.adult.email) requireOwner(data.adult);
  const body = await readJson(request);
  const fields = {};
  if ('name' in body) fields.name = requireString(body.name, 'name', { max: 60, optional: true });
  if ('household_id' in body) fields.household_id = requireString(body.household_id, 'household_id', { optional: true });
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  const res = await env.DB.prepare(`UPDATE adults SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE email = ?`)
    .bind(...keys.map((k) => fields[k]), email).run();
  if (!res.meta.changes) throw new HttpError(404, 'Adult not found');
  return json({ adult: await env.DB.prepare('SELECT * FROM adults WHERE email = ?').bind(email).first() });
}

export async function onRequestDelete({ env, data, params }) {
  requireOwner(data.adult);
  const email = decodeURIComponent(params.email).toLowerCase();
  if (email === data.adult.email) throw new HttpError(400, 'You can’t remove yourself');
  const res = await env.DB.prepare(`DELETE FROM adults WHERE email = ? AND role <> 'owner'`).bind(email).run();
  if (!res.meta.changes) throw new HttpError(404, 'Adult not found');
  return json({ ok: true });
}
