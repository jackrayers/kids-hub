// POST   /api/kid/wishlist  { kid_id, toy_id }  → add (up to WISHLIST_MAX)
// DELETE /api/kid/wishlist  { kid_id, toy_id }  → remove
// Rows a grown-up marked as bought are only hidden (removed_at), so the purchase isn't lost.
import { visibleBinds, visibleSql } from '../../../lib/audience.js';
import { WISHLIST_MAX } from '../../../lib/catalog.js';
import { HttpError, json, readJson, requireString } from '../../../lib/http.js';
import { requireOwnKid } from '../../../lib/kid-access.js';

async function parse(request, env, device) {
  const body = await readJson(request);
  const kid = await requireOwnKid(env, device, body.kid_id, 'santa');
  const toyId = requireString(body.toy_id, 'toy_id');
  return { kid, toyId };
}

async function listFor(env, kidId) {
  const { results } = await env.DB.prepare(`SELECT w.toy_id FROM wishlist w JOIN toys t ON t.id = w.toy_id
    WHERE w.kid_id = ? AND w.removed_at IS NULL AND t.status = 'approved' ORDER BY w.added_at`)
    .bind(kidId).all();
  return results.map((r) => r.toy_id);
}

export async function onRequestPost({ request, env, data }) {
  const { kid, toyId } = await parse(request, env, data.device);
  const toy = await env.DB.prepare(`SELECT t.id FROM toys t WHERE t.id = ? AND t.status = 'approved' AND ${visibleSql('t')}`)
    .bind(toyId, ...visibleBinds('toy', kid)).first();
  if (!toy) throw new HttpError(404, 'Toy not found');

  // Insert only while the list has room (single statement, so double-taps can't overfill it).
  const res = await env.DB.prepare(
    `INSERT INTO wishlist (kid_id, toy_id)
     SELECT ?, ? WHERE (SELECT COUNT(*) FROM wishlist w JOIN toys t ON t.id = w.toy_id
       WHERE w.kid_id = ? AND w.removed_at IS NULL AND t.status = 'approved') < ?
     ON CONFLICT (kid_id, toy_id) DO UPDATE SET removed_at = NULL, added_at = datetime('now')
       WHERE wishlist.removed_at IS NOT NULL`,
  ).bind(kid.id, toyId, kid.id, WISHLIST_MAX).run();
  const wishlist = await listFor(env, kid.id);
  if (!res.meta.changes && !wishlist.includes(toyId)) {
    throw new HttpError(409, 'Your list is full! Take one off to add another.');
  }
  return json({ wishlist });
}

export async function onRequestDelete({ request, env, data }) {
  const { kid, toyId } = await parse(request, env, data.device);
  await env.DB.batch([
    env.DB.prepare(`UPDATE wishlist SET removed_at = datetime('now')
      WHERE kid_id = ? AND toy_id = ? AND bought_at IS NOT NULL AND removed_at IS NULL`).bind(kid.id, toyId),
    env.DB.prepare('DELETE FROM wishlist WHERE kid_id = ? AND toy_id = ? AND bought_at IS NULL').bind(kid.id, toyId),
  ]);
  return json({ wishlist: await listFor(env, kid.id) });
}
