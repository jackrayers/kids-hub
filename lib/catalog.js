// Santa's Catalog shared bits: categories, prompts, toy shaping.
import { HttpError } from './http.js';

export const WISHLIST_MAX = 6; // fits one letter page

// Categories live in the `categories` table (editable in parent mode). 'other' is the
// fallback: it can't be deleted, and toys from a deleted category move there.
export const FALLBACK_CATEGORY = 'other';

export async function listCategories(db) {
  const { results } = await db.prepare('SELECT id, name, icon, sort FROM categories ORDER BY sort, name').all();
  return results;
}

export async function requireCategory(db, value) {
  const id = typeof value === 'string' && value ? value : FALLBACK_CATEGORY;
  const row = await db.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(400, `Unknown category "${id}"`);
  return id;
}

export async function listWithCounts(db) {
  const { results } = await db.prepare(`SELECT c.id, c.name, c.icon, c.sort,
      (SELECT COUNT(*) FROM toys t WHERE t.category = c.id) AS toys
    FROM categories c ORDER BY c.sort, c.name`).all();
  return results;
}

export function requireIcon(v) {
  const s = (typeof v === 'string' ? v.trim() : '') || '🎁';
  // One emoji (which can be several code points, e.g. flags or skin tones).
  if ([...s].length > 8) throw new HttpError(400, 'The icon should be a single emoji');
  return s;
}

// Prompts live here so the look stays consistent across the whole catalog.
export const SUBJECTS = ['auto', 'toy', 'box'];

const SUBJECT_RULES = {
  auto: `Decide what a child would recognize:
- If the product is something that lives in its box or IS mostly its box — a board game, card game, jigsaw puzzle, book, art or craft kit, building set shown only as a box — draw the box itself, standing up at a slight angle, keeping its main artwork, colors and shape. Simplify any lettering into soft shapes.
- Otherwise draw the toy itself, out of any packaging, and leave out boxes, bags, tags and blister packs.`,
  toy: 'Draw the toy itself, out of its packaging. Leave out boxes, bags, tags and blister packs. If several pieces are shown, arrange the main pieces together as a small, tidy group.',
  box: 'Draw the product box itself, standing up at a slight angle, keeping its main artwork, colors and shape. Simplify any lettering into soft shapes. You may show a few of the game pieces or contents in front of the box.',
};

/** Prompt for the storybook picture, tailored to this toy. */
export function stylizedPrompt({ title, subject = 'auto' }) {
  return `Redraw the product in this photo as a cheerful children's storybook illustration.
The product is: "${String(title || '').replace(/"/g, "'").slice(0, 80)}".
${SUBJECT_RULES[subject] || SUBJECT_RULES.auto}
Style: soft watercolor and gouache texture, gentle rounded shapes, bright friendly colors, warm cosy light.
Show it whole and centered, large enough to fill most of the square with just a small margin.
Background: completely flat, pure white (#FFFFFF) — no shadow, no floor, no surface, no texture, no vignette.
Keep its recognizable shape, colors and key details so a young child knows exactly what it is.
No readable text, no brand logos, no price tags, no hands or people. Square image.`;
}

export const PROMPTS = {
  coloring: `Turn this illustration into a page from a children's coloring book.
Bold, clean, thick black outlines only on a pure white background. No shading, no grey, no color, no text.
Keep the same subject, pose and composition, simple enough for a 4 to 6 year old to color in. Square image.`,
};

const img = (key) => (key ? `/img/${key}` : null);

export function shapeToy(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    subject: row.subject || 'auto',
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
