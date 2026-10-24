import { HttpError, requireInt, requireString } from '../../../../lib/http.js';

/** Validates optional kid fields; returns only the keys present in body. */
export function validateKidFields(body) {
  const out = {};
  if ('birth_year' in body) {
    const thisYear = new Date().getUTCFullYear();
    out.birth_year = requireInt(body.birth_year, 'birth_year', { min: thisYear - 18, max: thisYear, optional: true });
  }
  if ('emoji' in body) out.emoji = requireString(body.emoji, 'emoji', { max: 16, optional: true });
  if ('color' in body) {
    const c = requireString(body.color, 'color', { max: 7, optional: true });
    if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw new HttpError(400, 'color must look like #A1B2C3');
    out.color = c;
  }
  if ('ui_mode' in body) {
    if (!['picture', 'reader'].includes(body.ui_mode)) throw new HttpError(400, 'ui_mode must be picture or reader');
    out.ui_mode = body.ui_mode;
  }
  return out;
}
