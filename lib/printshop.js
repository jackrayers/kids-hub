// Print Shop shared bits: shaping rows, prices, validation.
import { HttpError, requireInt, requireString } from './http.js';
import { pushToAdults } from './webpush.js';

const img = (key) => (key ? `/img/${key}` : null);
const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export function shapeModel(row) {
  return {
    id: row.id,
    title: row.title,
    source_url: row.source_url,
    file_name: row.file_name,
    preview: img(row.preview_key),
    thumb: img(row.thumb_key),
    slots: parse(row.slots, []),
    size_mm: parse(row.size_mm, null),
    price_single: row.price_single,
    price_multi: row.price_multi,
    status: row.status,
    sort: row.sort,
    created_at: row.created_at,
  };
}

export async function getModelRow(db, id) {
  const row = await db.prepare('SELECT * FROM models WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Model not found');
  return row;
}

export const FINISH_IDS = ['solid', 'matte', 'silk', 'marble', 'sparkle', 'rainbow', 'wood', 'glow'];

export function shapeFilament(row) {
  return {
    id: row.id, name: row.name, hex: row.hex, hex2: row.hex2 || null, finish: row.finish || 'solid',
    material: row.material, in_stock: !!row.in_stock, sort: row.sort,
  };
}

export function requireFinish(v) {
  if (v == null || v === '') return 'solid';
  if (!FINISH_IDS.includes(v)) throw new HttpError(400, `finish must be one of ${FINISH_IDS.join(', ')}`);
  return v;
}

export function requireHex(v, field = 'hex') {
  const s = requireString(v, field, { max: 7 });
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new HttpError(400, `${field} must look like #A1B2C3`);
  return s.toUpperCase();
}

/** Validates the slots array an adult saves: [{ extruder 1-5, name, hex, share }]. */
export function validateSlots(slots) {
  if (!Array.isArray(slots) || !slots.length || slots.length > 5) throw new HttpError(400, 'A model needs 1–5 color slots');
  const seen = new Set();
  return slots.map((s, i) => {
    const extruder = requireInt(s.extruder, `slots[${i}].extruder`, { min: 1, max: 5 });
    if (seen.has(extruder)) throw new HttpError(400, 'Each extruder can only be one slot');
    seen.add(extruder);
    return {
      extruder,
      name: requireString(s.name, `slots[${i}].name`, { max: 30 }),
      hex: requireHex(s.hex, `slots[${i}].hex`),
      share: typeof s.share === 'number' && s.share >= 0 && s.share <= 1 ? Math.round(s.share * 1000) / 1000 : null,
    };
  });
}

/** Price for a set of chosen filament ids: one filament = single price, two or more = multi. */
export function priceFor(model, filamentIds) {
  const multi = new Set(filamentIds).size > 1;
  return { multi, cost: multi ? model.price_multi : model.price_single };
}

export function shapeRequest(row) {
  return {
    id: row.id,
    kid_id: row.kid_id,
    kid_name: row.kid_name,
    household_name: row.household_name,
    model_id: row.model_id,
    model_title: row.model_title,
    thumb: img(row.thumb_key),
    colors: parse(row.colors, []),
    multi: !!row.multi,
    cost: row.cost,
    status: row.status,
    refund_reason: row.refund_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Best-effort alerts for grown-ups after the response is sent: Web Push to every device
 * that turned alerts on, plus the optional Home Assistant webhook (HA_WEBHOOK_URL).
 */
export function notifyGrownups(env, waitUntil, { push, webhook }) {
  if (push) waitUntil(pushToAdults(env, push).catch((err) => console.error('push failed', err)));
  if (webhook && env.HA_WEBHOOK_URL) {
    waitUntil(fetch(env.HA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(webhook),
    }).catch(() => {}));
  }
}
