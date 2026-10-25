// POST /api/admin/shopping/clear  { kid_id }
// Empties a kid's wish list so they can start fresh. Wishes already bought stay in the
// shopping history (marked "taken off list"); everything else is removed.
import { getKid } from '../../../../lib/db.js';
import { json, readJson, requireString } from '../../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const kid = await getKid(env.DB, requireString(body.kid_id, 'kid_id'));
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM wishlist WHERE kid_id = ? AND bought_at IS NULL').bind(kid.id),
    env.DB.prepare("UPDATE wishlist SET removed_at = datetime('now') WHERE kid_id = ? AND bought_at IS NOT NULL AND removed_at IS NULL").bind(kid.id),
  ]);
  return json({ ok: true, cleared: res[0].meta.changes + res[1].meta.changes });
}
