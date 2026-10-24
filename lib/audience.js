// Who can see a toy or model. No audience rows = everyone; otherwise the listed
// households and/or kids. Shared by Santa's Catalog and the Print Shop.
import { HttpError } from './http.js';

const TYPES = ['toy', 'model'];
export function requireItemType(t) {
  if (!TYPES.includes(t)) throw new HttpError(400, 'item_type must be toy or model');
  return t;
}

/** SQL fragment: true when the item (alias.id) is visible to kid ?kid in household ?household. Bind (type, type, kidId, householdId). */
export function visibleSql(alias) {
  return `(NOT EXISTS (SELECT 1 FROM item_audience a WHERE a.item_type = ? AND a.item_id = ${alias}.id)
    OR EXISTS (SELECT 1 FROM item_audience a WHERE a.item_type = ? AND a.item_id = ${alias}.id
      AND (a.kid_id = ? OR (a.kid_id IS NULL AND a.household_id = ?))))`;
}
export const visibleBinds = (type, kid) => [type, type, kid.id, kid.household_id];

/** Map item_id → { households: [...], kids: [...] } for every item of a type that has a restricted audience. */
export async function audienceMap(db, type) {
  const { results } = await db.prepare('SELECT item_id, household_id, kid_id FROM item_audience WHERE item_type = ?')
    .bind(type).all();
  const map = {};
  for (const r of results) {
    const e = (map[r.item_id] ||= { households: [], kids: [] });
    if (r.kid_id) e.kids.push(r.kid_id); else e.households.push(r.household_id);
  }
  return map;
}

/** Statements that replace an item's audience (empty lists = everyone). */
export function setAudienceStmts(db, type, itemId, { households = [], kids = [] } = {}) {
  const stmts = [db.prepare('DELETE FROM item_audience WHERE item_type = ? AND item_id = ?').bind(type, itemId)];
  for (const h of new Set(households)) {
    stmts.push(db.prepare('INSERT INTO item_audience (item_type, item_id, household_id) VALUES (?, ?, ?)').bind(type, itemId, h));
  }
  for (const k of new Set(kids)) {
    stmts.push(db.prepare('INSERT INTO item_audience (item_type, item_id, kid_id) VALUES (?, ?, ?)').bind(type, itemId, k));
  }
  return stmts;
}

export const clearAudienceStmt = (db, type, itemId) =>
  db.prepare('DELETE FROM item_audience WHERE item_type = ? AND item_id = ?').bind(type, itemId);
