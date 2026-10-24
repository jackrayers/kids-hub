// GET /api/kid/catalog?kid=<id> → approved toys, categories, and this kid's wish list.
import { visibleBinds, visibleSql } from '../../../lib/audience.js';
import { listCategories, WISHLIST_MAX } from '../../../lib/catalog.js';
import { json } from '../../../lib/http.js';
import { requireOwnKid } from '../../../lib/kid-access.js';

export async function onRequestGet({ request, env, data }) {
  const kid = await requireOwnKid(env, data.device, new URL(request.url).searchParams.get('kid'), 'santa');
  const [toys, wish] = await env.DB.batch([
    env.DB.prepare(`SELECT t.id, t.title, t.category, t.stylized_key, t.coloring_key, t.cutout_key FROM toys t
      WHERE t.status = 'approved' AND ${visibleSql('t')} ORDER BY t.sort, t.created_at DESC`).bind(...visibleBinds('toy', kid)),
    env.DB.prepare(`SELECT w.toy_id FROM wishlist w JOIN toys t ON t.id = w.toy_id
      WHERE w.kid_id = ? AND w.removed_at IS NULL AND t.status = 'approved' AND ${visibleSql('t')}
      ORDER BY w.added_at`).bind(kid.id, ...visibleBinds('toy', kid)),
  ]);
  const used = new Set(toys.results.map((t) => t.category));
  return json({
    kid: { id: kid.id, name: kid.name },
    categories: (await listCategories(env.DB)).filter((c) => used.has(c.id)).map(({ id, name, icon }) => ({ id, name, icon })),
    toys: toys.results.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      image: `/img/${t.cutout_key || t.stylized_key}`,
      cutout: !!t.cutout_key,
      coloring: `/img/${t.coloring_key}`,
    })),
    wishlist: wish.results.map((w) => w.toy_id),
    wishlist_max: WISHLIST_MAX,
  });
}
