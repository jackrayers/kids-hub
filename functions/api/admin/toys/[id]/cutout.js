// POST   /api/admin/toys/:id/cutout   body: image/webp or image/png with transparency (made in parent mode)
// DELETE /api/admin/toys/:id/cutout   → kids see the white-background picture again
import { getToyRow, shapeToy } from '../../../../../lib/catalog.js';
import { HttpError, json } from '../../../../../lib/http.js';
import { deleteImages, putImage } from '../../../../../lib/images.js';

const MAX_BYTES = 4 * 1024 * 1024;

export async function onRequestPost({ request, env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  const mime = (request.headers.get('content-type') || '').split(';')[0];
  if (!['image/png', 'image/webp'].includes(mime)) throw new HttpError(415, 'Cutouts must be PNG or WebP');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'Empty image');
  if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'Cutout is larger than 4 MB');

  const key = await putImage(env, `toys/${toy.id}/cutout`, bytes, mime);
  await env.DB.prepare(`UPDATE toys SET cutout_key = ?, updated_at = datetime('now') WHERE id = ?`).bind(key, toy.id).run();
  await deleteImages(env, toy.cutout_key);
  return json({ toy: shapeToy(await getToyRow(env.DB, toy.id)) });
}

export async function onRequestDelete({ env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  if (toy.cutout_key) {
    await env.DB.prepare(`UPDATE toys SET cutout_key = NULL, updated_at = datetime('now') WHERE id = ?`).bind(toy.id).run();
    await deleteImages(env, toy.cutout_key);
  }
  return json({ toy: shapeToy(await getToyRow(env.DB, toy.id)) });
}
