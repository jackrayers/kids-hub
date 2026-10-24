// POST /api/admin/shopping/bought  { kid_id, toy_id, bought: true|false }
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  const kidId = requireString(body.kid_id, 'kid_id');
  const toyId = requireString(body.toy_id, 'toy_id');
  if (typeof body.bought !== 'boolean') throw new HttpError(400, 'bought must be true or false');

  const row = await env.DB.prepare('SELECT * FROM wishlist WHERE kid_id = ? AND toy_id = ?').bind(kidId, toyId).first();
  if (!row) throw new HttpError(404, 'That wish isn’t on the list any more');

  if (body.bought) {
    await env.DB.prepare(`UPDATE wishlist SET bought_by = ?, bought_at = datetime('now') WHERE kid_id = ? AND toy_id = ?`)
      .bind(data.adult.email, kidId, toyId).run();
  } else if (row.removed_at) {
    // Kid already took it off their list; un-buying means it's gone entirely.
    await env.DB.prepare('DELETE FROM wishlist WHERE kid_id = ? AND toy_id = ?').bind(kidId, toyId).run();
  } else {
    await env.DB.prepare('UPDATE wishlist SET bought_by = NULL, bought_at = NULL WHERE kid_id = ? AND toy_id = ?')
      .bind(kidId, toyId).run();
  }
  return json({ ok: true });
}
