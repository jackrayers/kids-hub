// GET /api/admin/wishlists → every kid's current wish list (for the grown-ups' shopping).
import { json } from '../../../lib/http.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT k.id AS kid_id, k.name AS kid_name, h.name AS household_name,
           t.id AS toy_id, t.title, t.source_url, t.stylized_key, w.added_at
    FROM wishlist w
    JOIN kids k ON k.id = w.kid_id
    JOIN households h ON h.id = k.household_id
    JOIN toys t ON t.id = w.toy_id AND t.status = 'approved'
    ORDER BY h.name, k.sort, k.name, w.added_at`).all();

  const byKid = new Map();
  for (const r of results) {
    if (!byKid.has(r.kid_id)) {
      byKid.set(r.kid_id, { kid_id: r.kid_id, kid_name: r.kid_name, household_name: r.household_name, toys: [] });
    }
    byKid.get(r.kid_id).toys.push({
      id: r.toy_id, title: r.title, source_url: r.source_url, image: `/img/${r.stylized_key}`, added_at: r.added_at,
    });
  }
  return json({ wishlists: [...byKid.values()] });
}
