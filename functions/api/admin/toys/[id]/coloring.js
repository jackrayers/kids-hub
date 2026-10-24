// POST /api/admin/toys/:id/coloring   body: image/png — a coloring page made in parent mode
// (used when Gemini won't draw the toy).
import { getToyRow, shapeToy } from '../../../../../lib/catalog.js';
import { HttpError, json } from '../../../../../lib/http.js';
import { deleteImages, putImage } from '../../../../../lib/images.js';

export async function onRequestPost({ request, env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  if ((request.headers.get('content-type') || '').split(';')[0] !== 'image/png') throw new HttpError(415, 'Coloring pages must be PNG');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'Empty image');
  if (bytes.byteLength > 4 * 1024 * 1024) throw new HttpError(413, 'Coloring page is larger than 4 MB');
  const key = await putImage(env, `toys/${toy.id}/coloring`, bytes, 'image/png');
  await env.DB.prepare(`UPDATE toys SET coloring_key = ?, gen_error = NULL, updated_at = datetime('now') WHERE id = ?`).bind(key, toy.id).run();
  await deleteImages(env, toy.coloring_key);
  return json({ toy: shapeToy(await getToyRow(env.DB, toy.id)) });
}
