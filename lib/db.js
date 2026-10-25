import { resolveApps } from './apps.js';
import { newId } from './crypto.js';
import { HttpError } from './http.js';

const KID_COLUMNS = `
  k.id, k.household_id, k.name, k.birth_year, k.emoji, k.color, k.avatar_key,
  k.ui_mode, k.active, k.sort,
  COALESCE((SELECT SUM(delta) FROM ledger l WHERE l.kid_id = k.id), 0) AS balance,
  (SELECT json_group_array(json_object('app', a.app, 'enabled', a.enabled))
     FROM kid_apps a WHERE a.kid_id = k.id) AS app_rows`;

export function shapeKid(row) {
  if (!row) return row;
  const { app_rows, ...rest } = row;
  return {
    ...rest,
    active: !!row.active,
    avatar_url: row.avatar_key ? `/img/${row.avatar_key}` : null,
    apps: resolveApps(app_rows ? JSON.parse(app_rows) : []),
  };
}

export async function listKids(db, { householdId = null, includeInactive = false } = {}) {
  const where = ['k.deleted_at IS NULL'];
  const binds = [];
  if (householdId) { where.push('k.household_id = ?'); binds.push(householdId); }
  if (!includeInactive) where.push('k.active = 1');
  const sql = `SELECT ${KID_COLUMNS} FROM kids k
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY k.sort, k.name`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return results.map(shapeKid);
}

export async function getKid(db, id) {
  const row = await db.prepare(`SELECT ${KID_COLUMNS} FROM kids k WHERE k.id = ? AND k.deleted_at IS NULL`).bind(id).first();
  if (!row) throw new HttpError(404, 'Kid not found');
  return shapeKid(row);
}

export async function balanceOf(db, kidId) {
  const row = await db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger WHERE kid_id = ?')
    .bind(kidId).first();
  return row.balance;
}

/** Prepared statement for a ledger insert — combine in db.batch() with related writes. */
export function ledgerInsert(db, { kidId, delta, kind, reason = null, refType = null, refId = null, actor }) {
  return db.prepare(
    `INSERT INTO ledger (id, kid_id, delta, kind, reason, ref_type, ref_id, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId(), kidId, delta, kind, reason, refType, refId, actor);
}

export async function listLedger(db, { kidId = null, limit = 100 } = {}) {
  const sql = `SELECT l.*, k.name AS kid_name FROM ledger l JOIN kids k ON k.id = l.kid_id
    ${kidId ? 'WHERE l.kid_id = ?' : ''} ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?`;
  const stmt = kidId ? db.prepare(sql).bind(kidId, limit) : db.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return results;
}

/** For locking a tablet: the kid must exist in that household. Returns kidId or null. */
export async function kidInHousehold(db, kidId, householdId) {
  if (!kidId) return null;
  const kid = await db.prepare('SELECT id FROM kids WHERE id = ? AND household_id = ?').bind(kidId, householdId).first();
  if (!kid) throw new HttpError(400, 'That kid isn’t in this household');
  return kid.id;
}
