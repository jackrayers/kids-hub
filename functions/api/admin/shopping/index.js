// GET /api/admin/shopping → every kid's wishes with buy links and who bought what.
// Bought status is for grown-ups only; kid endpoints never return it.
import { json } from '../../../../lib/http.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT k.id AS kid_id, k.name AS kid_name, k.emoji, k.color, k.avatar_key,
           h.id AS household_id, h.name AS household_name,
           t.id AS toy_id, t.title, t.source_url, t.stylized_key,
           w.added_at, w.bought_by, w.bought_at, w.removed_at,
           a.name AS bought_by_name
    FROM wishlist w
    JOIN kids k ON k.id = w.kid_id
    JOIN households h ON h.id = k.household_id
    JOIN toys t ON t.id = w.toy_id
    LEFT JOIN adults a ON a.email = w.bought_by
    WHERE t.status = 'approved' OR w.bought_at IS NOT NULL
    ORDER BY h.name, k.sort, k.name, w.added_at`).all();

  const kids = new Map();
  for (const r of results) {
    if (!kids.has(r.kid_id)) {
      kids.set(r.kid_id, {
        kid_id: r.kid_id, kid_name: r.kid_name, household_name: r.household_name,
        emoji: r.emoji, color: r.color, avatar_url: r.avatar_key ? `/img/${r.avatar_key}` : null,
        items: [],
      });
    }
    kids.get(r.kid_id).items.push({
      toy_id: r.toy_id,
      title: r.title,
      image: r.stylized_key ? `/img/${r.stylized_key}` : null,
      source_url: r.source_url,
      added_at: r.added_at,
      bought: !!r.bought_at,
      bought_by: r.bought_by ? (r.bought_by_name || r.bought_by) : null,
      bought_at: r.bought_at,
      removed: !!r.removed_at,
    });
  }
  const list = [...kids.values()];
  const all = list.flatMap((k) => k.items);
  return json({
    kids: list,
    totals: { wishes: all.filter((i) => !i.removed).length, bought: all.filter((i) => i.bought).length },
  });
}
