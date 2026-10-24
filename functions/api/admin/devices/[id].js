// PATCH  /api/admin/devices/:id  { kid_id: string|null, name? } → lock to a kid / share with household
// DELETE /api/admin/devices/:id → revoke (the tablet will need to pair again).
import { kidInHousehold } from '../../../../lib/db.js';
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';

export async function onRequestPatch({ request, env, params }) {
  const device = await env.DB.prepare('SELECT * FROM devices WHERE id = ? AND revoked_at IS NULL').bind(params.id).first();
  if (!device) throw new HttpError(404, 'Tablet not found');
  const body = await readJson(request);
  const fields = {};
  if ('kid_id' in body) fields.kid_id = await kidInHousehold(env.DB, body.kid_id, device.household_id);
  if ('name' in body) fields.name = requireString(body.name, 'name', { max: 40 });
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  await env.DB.prepare(`UPDATE devices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), device.id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  const res = await env.DB.prepare(
    `UPDATE devices SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL`,
  ).bind(params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Device not found or already revoked');
  return json({ ok: true });
}
