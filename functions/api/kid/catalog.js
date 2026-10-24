// GET /api/kid/catalog?kid=<id> → approved toys, categories, and this kid's wish list.
import { CATEGORIES, WISHLIST_MAX } from '../../../lib/catalog.js';
import { json } from '../../../lib/http.js';
import { requireOwnKid } from '../../../lib/kid-access.js';

export async function onRequestGet({ request, env, data }) {
  const kid = await requireOwnKid(env, data.device, new URL(request.url).searchParams.get('kid'), 'santa');
  const [toys, wish] = await env.DB.batch([
    env.DB.prepare(`SELECT id, title, category, stylized_key, coloring_key FROM toys
      WHERE status = 'approved' ORDER BY sort, created_at DESC`),
    env.DB.prepare(`SELECT w.toy_id FROM wishlist w JOIN toys t ON t.id = w.toy_id
      WHERE w.kid_id = ? AND w.removed_at IS NULL AND t.status = 'approved' ORDER BY w.added_at`).bind(kid.id),
  ]);
  const used = new Set(toys.results.map((t) => t.category));
  return json({
    kid: { id: kid.id, name: kid.name },
    categories: CATEGORIES.filter((c) => used.has(c.id)),
    toys: toys.results.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      image: `/img/${t.stylized_key}`,
      coloring: `/img/${t.coloring_key}`,
    })),
    wishlist: wish.results.map((w) => w.toy_id),
    wishlist_max: WISHLIST_MAX,
  });
}
