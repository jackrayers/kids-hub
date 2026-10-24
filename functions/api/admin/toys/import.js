// POST /api/admin/toys/import  { url, title?, category? }
// Reads the product page, saves its main photo, and creates a draft toy.
import { getToyRow, requireCategory, shapeToy } from '../../../../lib/catalog.js';
import { newId } from '../../../../lib/crypto.js';
import { downloadImage, readProductPage } from '../../../../lib/fetch-product.js';
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';
import { putImage } from '../../../../lib/images.js';

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  const pageUrl = requireString(body.url, 'url', { max: 2000 });
  const category = requireCategory(body.category || 'other');

  const page = await readProductPage(pageUrl);
  const title = requireString(body.title, 'title', { max: 80, optional: true })
    || (page.title || '')
      .replace(/^amazon\.com\s*:\s*/i, '')
      .replace(/\s+:\s+(toys|games)[^:]*$/i, '')
      .replace(/\s+\|\s+[^|]{2,40}$/, '') // " | Shop name"
      .slice(0, 80).trim();
  if (!title) throw new HttpError(422, 'Couldn’t find the toy’s name. Type a title and try again.');

  const image = await downloadImage(page.imageUrl);
  const id = newId();
  const sourceKey = await putImage(env, `toys/${id}/source`, image.bytes, image.mime);
  await env.DB.prepare(
    'INSERT INTO toys (id, title, source_url, source_key, category, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, title, pageUrl, sourceKey, category, data.adult.email).run();
  return json({ toy: shapeToy(await getToyRow(env.DB, id)) }, 201);
}
