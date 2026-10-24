// The apps a kid can have. Add new ones here; the hub and parent mode pick them up.
import { HttpError } from './http.js';

export const APPS = [
  { id: 'santa', name: 'Santa’s Catalog', sub: 'Pick toys for your letter', icon: '🎅', theme: 'santa', path: '/catalog/', ready: true, default_enabled: true },
  { id: 'print', name: 'Print Shop', sub: 'Spend your stars', icon: '🧩', theme: 'print', path: '/print/', ready: false, default_enabled: true },
];

export const APP_IDS = APPS.map((a) => a.id);

export function requireAppId(app) {
  if (!APP_IDS.includes(app)) throw new HttpError(400, `Unknown app "${app}"`);
  return app;
}

/** { santa: true, print: false } for one kid, from their kid_apps rows. */
export function resolveApps(rows = []) {
  const out = {};
  for (const a of APPS) out[a.id] = a.default_enabled;
  for (const r of rows) if (r.app in out) out[r.app] = !!r.enabled;
  return out;
}

/** Upsert statement for one switch; batch these. */
export function setAppStmt(db, kidId, app, enabled, actor) {
  return db.prepare(
    `INSERT INTO kid_apps (kid_id, app, enabled, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (kid_id, app) DO UPDATE SET enabled = excluded.enabled,
       updated_by = excluded.updated_by, updated_at = datetime('now')`,
  ).bind(kidId, requireAppId(app), enabled ? 1 : 0, actor);
}

/** Throws 403 unless the kid has this app switched on (use in kid-facing app endpoints). */
export async function requireKidApp(db, kidId, app) {
  const { results } = await db.prepare('SELECT app, enabled FROM kid_apps WHERE kid_id = ?').bind(kidId).all();
  if (!resolveApps(results)[app]) throw new HttpError(403, 'That app is turned off for this kid');
}
