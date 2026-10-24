// PATCH  /api/admin/toys/:id  { title?, category?, status?, sort?, source_url? }
// DELETE /api/admin/toys/:id  → removes the toy, its images and any wish-list entries
import { getToyRow, requireCategory, shapeToy } from '../../../../../lib/catalog.js';
import { parseUrl } from '../../../../../lib/fetch-product.js';
import { HttpError, json, readJson, requireInt, requireString } from '../../../../../lib/http.js';
import { deleteImages } from '../../../../../lib/images.js';

export async function onRequestPatch({ request, env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  const body = await readJson(request);
  const fields = {};
  if ('title' in body) fields.title = requireString(body.title, 'title', { max: 80 });
  if ('category' in body) fields.category = requireCategory(body.category);
  if ('sort' in body) fields.sort = requireInt(body.sort, 'sort', { min: 0, max: 9999 });
  if ('source_url' in body) {
    const raw = requireString(body.source_url, 'source_url', { max: 2000, optional: true });
    fields.source_url = raw ? parseUrl(raw).toString() : null;
  }
  if ('status' in body) {
    if (!['draft', 'approved', 'hidden'].includes(body.status)) throw new HttpError(400, 'Unknown status');
    if (body.status === 'approved' && (!toy.stylized_key || !toy.coloring_key)) {
      throw new HttpError(400, 'Make both pictures before approving');
    }
    fields.status = body.status;
  }
  const keys = Object.keys(fields);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  await env.DB.prepare(
    `UPDATE toys SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
  ).bind(...keys.map((k) => fields[k]), toy.id).run();
  return json({ toy: shapeToy(await getToyRow(env.DB, toy.id)) });
}

export async function onRequestDelete({ env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM wishlist WHERE toy_id = ?').bind(toy.id),
    env.DB.prepare('DELETE FROM toys WHERE id = ?').bind(toy.id),
  ]);
  await deleteImages(env, toy.source_key, toy.stylized_key, toy.coloring_key, toy.cutout_key);
  return json({ ok: true });
}
