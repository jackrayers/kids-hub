// GET  /api/admin/categories            → { categories: [{ id, name, icon, sort, toys }] }
// POST /api/admin/categories            { name, icon? } → adds one (just before "Other")
// PUT  /api/admin/categories            { order: [id, …] } → saves the order
import { FALLBACK_CATEGORY, listWithCounts, requireIcon } from '../../../../lib/catalog.js';
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';

const slug = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'category';

export async function onRequestGet({ env }) {
  return json({ categories: await listWithCounts(env.DB) });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const name = requireString(body.name, 'name', { max: 30 });
  const icon = requireIcon(body.icon);
  const taken = await env.DB.prepare('SELECT 1 FROM categories WHERE lower(name) = lower(?)').bind(name).first();
  if (taken) throw new HttpError(409, `There’s already a “${name}” category`);
  let id = slug(name);
  for (let n = 2; await env.DB.prepare('SELECT 1 FROM categories WHERE id = ?').bind(id).first(); n++) id = `${slug(name)}-${n}`;
  const { m } = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM categories WHERE id <> ?').bind(FALLBACK_CATEGORY).first();
  await env.DB.prepare('INSERT INTO categories (id, name, icon, sort) VALUES (?, ?, ?, ?)').bind(id, name, icon, m + 10).run();
  return json({ id, categories: await listWithCounts(env.DB) }, 201);
}

export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  if (!Array.isArray(body.order) || !body.order.every((x) => typeof x === 'string')) throw new HttpError(400, 'order must be a list of ids');
  // "Other" always stays last.
  const order = body.order.filter((id) => id !== FALLBACK_CATEGORY);
  await env.DB.batch(order.map((id, i) => env.DB.prepare('UPDATE categories SET sort = ? WHERE id = ?').bind((i + 1) * 10, id)));
  return json({ categories: await listWithCounts(env.DB) });
}
