// Santa's Catalog shared bits: categories, prompts, toy shaping.
import { HttpError } from './http.js';

export const WISHLIST_MAX = 6; // fits one letter page

export const CATEGORIES = [
  { id: 'building', name: 'Building', icon: '🧱' },
  { id: 'cuddly', name: 'Dolls & cuddly', icon: '🧸' },
  { id: 'vehicles', name: 'Cars & trains', icon: '🚂' },
  { id: 'pretend', name: 'Pretend play', icon: '👑' },
  { id: 'arts', name: 'Arts & crafts', icon: '🎨' },
  { id: 'games', name: 'Games & puzzles', icon: '🎲' },
  { id: 'outdoor', name: 'Outdoor & active', icon: '⚽' },
  { id: 'books', name: 'Books', icon: '📚' },
  { id: 'other', name: 'Other', icon: '🎁' },
];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function requireCategory(value) {
  if (!CATEGORY_IDS.includes(value)) throw new HttpError(400, `Unknown category "${value}"`);
  return value;
}

// Prompts live here so the look stays consistent across the whole catalog.
export const PROMPTS = {
  stylized: `Redraw the toy in this photo as a cheerful children's storybook illustration.
Style: soft watercolor and gouache texture, gentle rounded shapes, bright friendly colors, warm cosy light.
Show only the toy, whole and centered, with clear space around it on all sides.
Background: completely flat, pure white (#FFFFFF) — no shadow, no floor, no surface, no texture, no vignette.
Keep the toy's recognizable shape, colors and key details so a young child knows exactly which toy it is.
No packaging, no text, no logos, no price tags, no hands or people. Square image.`,
  coloring: `Turn this illustration into a page from a children's coloring book.
Bold, clean, thick black outlines only on a pure white background. No shading, no grey, no color, no text.
Keep the same toy, pose and composition, simple enough for a 4 to 6 year old to color in. Square image.`,
};

const img = (key) => (key ? `/img/${key}` : null);

export function shapeToy(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    sort: row.sort,
    status: row.status,
    source_url: row.source_url,
    source_image: img(row.source_key),
    image: img(row.stylized_key),
    cutout: img(row.cutout_key),
    coloring: img(row.coloring_key),
    gen_error: row.gen_error,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

export async function getToyRow(db, id) {
  const row = await db.prepare('SELECT * FROM toys WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Toy not found');
  return row;
}
