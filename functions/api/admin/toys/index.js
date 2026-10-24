// GET  /api/admin/toys?status=draft|approved|hidden
// POST /api/admin/toys?title=...&category=...   body: image/jpeg|png|webp (a photo of the toy)
import { CATEGORIES, getToyRow, requireCategory, shapeToy } from '../../../../lib/catalog.js';
import { newId } from '../../../../lib/crypto.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../../../lib/fetch-product.js';
import { HttpError, json, requireString } from '../../../../lib/http.js';
import { putImage } from '../../../../lib/images.js';

export async function onRequestGet({ request, env }) {
  const status = new URL(request.url).searchParams.get('status');
  const stmt = status
    ? env.DB.prepare('SELECT * FROM toys WHERE status = ? ORDER BY created_at DESC').bind(status)
    : env.DB.prepare(`SELECT * FROM toys ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`);
  const { results } = await stmt.all();
  return json({ toys: results.map(shapeToy), categories: CATEGORIES });
}

export async function onRequestPost({ request, env, data }) {
  const url = new URL(request.url);
  const title = requireString(url.searchParams.get('title'), 'title', { max: 80 });
  const category = requireCategory(url.searchParams.get('category') || 'other');
  const mime = (request.headers.get('content-type') || '').split(';')[0];
  if (!IMAGE_TYPES[mime]) throw new HttpError(415, 'Upload a JPEG, PNG or WebP photo');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'Empty image');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, 'Photo is larger than 8 MB');

  const id = newId();
  const sourceKey = await putImage(env, `toys/${id}/source`, bytes, mime);
  await env.DB.prepare(
    'INSERT INTO toys (id, title, source_key, category, created_by) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, title, sourceKey, category, data.adult.email).run();
  return json({ toy: shapeToy(await getToyRow(env.DB, id)) }, 201);
}
