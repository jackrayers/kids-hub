// PATCH  /api/admin/categories/:id  { name?, icon? }
// DELETE /api/admin/categories/:id  → its toys move to "Other"
import { FALLBACK_CATEGORY, listWithCounts, requireIcon } from '../../../../lib/catalog.js';
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';

export async function onRequestPatch({ request, env, params }) {
  const body = await readJson(request);
  const f = {};
  if ('name' in body) {
    f.name = requireString(body.name, 'name', { max: 30 });
    const taken = await env.DB.prepare('SELECT 1 FROM categories WHERE lower(name) = lower(?) AND id <> ?').bind(f.name, params.id).first();
    if (taken) throw new HttpError(409, `There’s already a “${f.name}” category`);
  }
  if ('icon' in body) f.icon = requireIcon(body.icon);
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  const res = await env.DB.prepare(`UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => f[k]), params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Category not found');
  return json({ categories: await listWithCounts(env.DB) });
}

export async function onRequestDelete({ env, params }) {
  if (params.id === FALLBACK_CATEGORY) throw new HttpError(400, '“Other” is where toys go without a category, so it stays');
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE toys SET category = ?, updated_at = datetime('now') WHERE category = ?").bind(FALLBACK_CATEGORY, params.id),
    env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(params.id),
  ]);
  if (!res[1].meta.changes) throw new HttpError(404, 'Category not found');
  return json({ moved: res[0].meta.changes, categories: await listWithCounts(env.DB) });
}
