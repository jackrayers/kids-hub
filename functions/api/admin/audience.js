// PUT /api/admin/audience  { item_type: 'toy'|'model', item_id, households: [], kids: [] }
// Empty lists = everyone can see it.
import { requireItemType, setAudienceStmts } from '../../../lib/audience.js';
import { HttpError, json, readJson, requireString } from '../../../lib/http.js';

export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  const type = requireItemType(body.item_type);
  const itemId = requireString(body.item_id, 'item_id');
  const table = type === 'toy' ? 'toys' : 'models';
  const item = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(itemId).first();
  if (!item) throw new HttpError(404, 'Not found');
  const households = Array.isArray(body.households) ? body.households.filter((x) => typeof x === 'string') : [];
  const kids = Array.isArray(body.kids) ? body.kids.filter((x) => typeof x === 'string') : [];
  await env.DB.batch(setAudienceStmts(env.DB, type, itemId, { households, kids }));
  return json({ ok: true, audience: { households, kids } });
}
