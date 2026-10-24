// POST /api/admin/households/:id/apps  { app, enabled }
// Switches an app on/off for every kid in the household (individual kids can still be changed after).
import { requireAppId, setAppStmt } from '../../../../../lib/apps.js';
import { HttpError, json, readJson } from '../../../../../lib/http.js';

export async function onRequestPost({ request, env, params, data }) {
  const body = await readJson(request);
  const app = requireAppId(body.app);
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');

  const { results } = await env.DB.prepare('SELECT id FROM kids WHERE household_id = ?').bind(params.id).all();
  if (!results.length) throw new HttpError(404, 'No kids in that household');
  await env.DB.batch(results.map((k) => setAppStmt(env.DB, k.id, app, body.enabled, data.adult.email)));
  return json({ ok: true, updated: results.length });
}
