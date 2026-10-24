// POST /api/admin/toys/:id/use-photo → use the product photo as the kids' picture.
// For toys Gemini won't redraw (well-known characters and brands are often blocked).
import { getToyRow, shapeToy } from '../../../../../lib/catalog.js';
import { HttpError, json } from '../../../../../lib/http.js';
import { deleteImages, getImage, putImage } from '../../../../../lib/images.js';

export async function onRequestPost({ env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  if (!toy.source_key) throw new HttpError(400, 'This toy has no photo');
  const photo = await getImage(env, toy.source_key);
  if (!photo) throw new HttpError(404, 'The photo is missing from storage');

  const key = await putImage(env, `toys/${toy.id}/stylized`, photo.bytes, photo.mime);
  await env.DB.prepare(
    `UPDATE toys SET stylized_key = ?, cutout_key = NULL, gen_error = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).bind(key, toy.id).run();
  await deleteImages(env, toy.stylized_key, toy.cutout_key);
  return json({ toy: shapeToy(await getToyRow(env.DB, toy.id)) });
}
