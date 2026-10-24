// PATCH  /api/admin/models/:id  { title?, source_url?, slots?, size_mm?, price_single?, price_multi?, status?, sort? }
// DELETE /api/admin/models/:id  (only if no kid has asked for it; otherwise hide it)
import { clearAudienceStmt } from '../../../../../lib/audience.js';
import { parseUrl } from '../../../../../lib/fetch-product.js';
import { HttpError, json, readJson, requireInt, requireString } from '../../../../../lib/http.js';
import { deleteImages } from '../../../../../lib/images.js';
import { getModelRow, shapeModel, validateSlots } from '../../../../../lib/printshop.js';

export async function onRequestPatch({ request, env, params }) {
  const model = await getModelRow(env.DB, params.id);
  const body = await readJson(request);
  const f = {};
  if ('title' in body) f.title = requireString(body.title, 'title', { max: 60 });
  if ('source_url' in body) {
    const raw = requireString(body.source_url, 'source_url', { max: 2000, optional: true });
    f.source_url = raw ? parseUrl(raw).toString() : null;
  }
  if ('slots' in body) f.slots = JSON.stringify(validateSlots(body.slots));
  if ('size_mm' in body) {
    const s = body.size_mm;
    if (!Array.isArray(s) || s.length !== 3 || s.some((v) => typeof v !== 'number' || v < 0 || v > 1000)) throw new HttpError(400, 'size_mm must be [x, y, z]');
    f.size_mm = JSON.stringify(s.map((v) => Math.round(v * 10) / 10));
  }
  if ('price_single' in body) f.price_single = requireInt(body.price_single, 'price_single', { min: 0, max: 999 });
  if ('price_multi' in body) f.price_multi = requireInt(body.price_multi, 'price_multi', { min: 0, max: 999 });
  if ('sort' in body) f.sort = requireInt(body.sort, 'sort', { min: 0, max: 9999 });
  if ('status' in body) {
    if (!['draft', 'approved', 'hidden'].includes(body.status)) throw new HttpError(400, 'Unknown status');
    if (body.status === 'approved' && (!model.preview_key || !model.thumb_key)) throw new HttpError(400, 'Finish processing the model before approving');
    f.status = body.status;
  }
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  await env.DB.prepare(`UPDATE models SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...keys.map((k) => f[k]), model.id).run();
  return json({ model: shapeModel(await getModelRow(env.DB, model.id)) });
}

export async function onRequestDelete({ env, params }) {
  const model = await getModelRow(env.DB, params.id);
  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM print_requests WHERE model_id = ?').bind(model.id).first();
  if (used.n) throw new HttpError(409, 'Kids have asked for this one — hide it instead');
  await env.DB.batch([clearAudienceStmt(env.DB, 'model', model.id), env.DB.prepare('DELETE FROM models WHERE id = ?').bind(model.id)]);
  await deleteImages(env, model.file_key, model.preview_key, model.thumb_key);
  return json({ ok: true });
}
