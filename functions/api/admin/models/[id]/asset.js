// POST /api/admin/models/:id/asset?kind=preview|thumb
//   preview: application/octet-stream (light mesh made in parent mode)
//   thumb:   image/png or image/webp (transparent picture for the shelves)
import { HttpError, json } from '../../../../../lib/http.js';
import { deleteImages, putImage } from '../../../../../lib/images.js';
import { getModelRow, shapeModel } from '../../../../../lib/printshop.js';

export async function onRequestPost({ request, env, params }) {
  const model = await getModelRow(env.DB, params.id);
  const kind = new URL(request.url).searchParams.get('kind');
  const mime = (request.headers.get('content-type') || '').split(';')[0];
  let column;
  if (kind === 'preview') {
    if (mime !== 'application/octet-stream') throw new HttpError(415, 'Preview must be binary');
    column = 'preview_key';
  } else if (kind === 'thumb') {
    if (!['image/png', 'image/webp'].includes(mime)) throw new HttpError(415, 'Thumbnail must be PNG or WebP');
    column = 'thumb_key';
  } else throw new HttpError(400, 'kind must be preview or thumb');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw new HttpError(413, 'File is empty or larger than 8 MB');
  const key = await putImage(env, `models/${model.id}/${kind}`, bytes, mime);
  await env.DB.prepare(`UPDATE models SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).bind(key, model.id).run();
  await deleteImages(env, model[column]);
  return json({ model: shapeModel(await getModelRow(env.DB, model.id)) });
}
