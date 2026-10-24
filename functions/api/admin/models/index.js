// GET  /api/admin/models
// POST /api/admin/models?name=<file name>   body: the PrusaSlicer project .3mf → new draft model
// (parent mode then uploads the preview + thumbnail and saves slots/prices with PATCH)
import { audienceMap } from '../../../../lib/audience.js';
import { newId } from '../../../../lib/crypto.js';
import { HttpError, json } from '../../../../lib/http.js';
import { putImage } from '../../../../lib/images.js';
import { getModelRow, shapeModel } from '../../../../lib/printshop.js';

const MAX_BYTES = 95 * 1024 * 1024;

export async function onRequestGet({ env }) {
  const [{ results }, counts] = await Promise.all([
    env.DB.prepare(`SELECT * FROM models ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, sort, created_at DESC`).all(),
    env.DB.prepare(`SELECT model_id, COUNT(*) AS n FROM print_requests WHERE status <> 'refunded' GROUP BY model_id`).all(),
  ]);
  const audience = await audienceMap(env.DB, 'model');
  const n = Object.fromEntries(counts.results.map((r) => [r.model_id, r.n]));
  return json({ models: results.map((r) => ({ ...shapeModel(r), audience: audience[r.id] || null, requests: n[r.id] || 0 })) });
}

export async function onRequestPost({ request, env, data }) {
  const name = (new URL(request.url).searchParams.get('name') || 'model.3mf').slice(0, 120);
  if (!/\.3mf$/i.test(name)) throw new HttpError(415, 'Upload a PrusaSlicer project (.3mf)');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'Empty file');
  if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'File is larger than 95 MB');
  const id = newId();
  const fileKey = await putImage(env, `models/${id}/project`, bytes, 'model/3mf');
  const title = name.replace(/\.3mf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+v?\d+(\.\d+)*$/i, '').trim().replace(/^./, (c) => c.toUpperCase()) || 'New model';
  await env.DB.prepare('INSERT INTO models (id, title, file_key, file_name, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind(id, title.slice(0, 60), fileKey, name, data.adult.email).run();
  return json({ model: shapeModel(await getModelRow(env.DB, id)) }, 201);
}
