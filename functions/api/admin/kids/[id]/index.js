// GET   /api/admin/kids/:id
// DELETE /api/admin/kids/:id → removes the kid (kept but hidden if they have star/print history)
// PATCH /api/admin/kids/:id  { name?, household_id?, birth_year?, emoji?, color?, ui_mode?, active?, sort?,
//                             apps?: { santa: bool, print: bool } }
import { setAppStmt } from '../../../../../lib/apps.js';
import { getKid } from '../../../../../lib/db.js';
import { HttpError, json, readJson, requireInt, requireString } from '../../../../../lib/http.js';
import { validateKidFields } from '../_validate.js';

export async function onRequestGet({ env, params }) {
  return json({ kid: await getKid(env.DB, params.id) });
}

export async function onRequestPatch({ request, env, params, data }) {
  await getKid(env.DB, params.id); // 404 if missing
  const body = await readJson(request);
  const fields = validateKidFields(body);
  if ('name' in body) fields.name = requireString(body.name, 'name', { max: 40 });
  if ('household_id' in body) fields.household_id = requireString(body.household_id, 'household_id');
  if ('active' in body) fields.active = body.active ? 1 : 0;
  if ('sort' in body) fields.sort = requireInt(body.sort, 'sort', { min: 0, max: 999 });

  const stmts = [];
  const keys = Object.keys(fields);
  if (keys.length) {
    stmts.push(env.DB.prepare(`UPDATE kids SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .bind(...keys.map((k) => fields[k]), params.id));
  }
  if (body.apps !== undefined) {
    if (typeof body.apps !== 'object' || body.apps === null) throw new HttpError(400, 'apps must be an object');
    for (const [app, on] of Object.entries(body.apps)) {
      stmts.push(setAppStmt(env.DB, params.id, app, !!on, data.adult.email));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ kid: await getKid(env.DB, params.id) });
}

export async function onRequestDelete({ env, params }) {
  const kid = await getKid(env.DB, params.id); // 404 if missing
  const id = kid.id;
  const history = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM ledger WHERE kid_id = ?) + (SELECT COUNT(*) FROM print_requests WHERE kid_id = ?) AS n`)
    .bind(id, id).first();
  const cleanup = [
    env.DB.prepare('DELETE FROM wishlist WHERE kid_id = ?').bind(id),
    env.DB.prepare('DELETE FROM kid_apps WHERE kid_id = ?').bind(id),
    env.DB.prepare('DELETE FROM item_audience WHERE kid_id = ?').bind(id),
    env.DB.prepare('UPDATE devices SET kid_id = NULL WHERE kid_id = ?').bind(id),
    env.DB.prepare('DELETE FROM pairing_codes WHERE kid_id = ?').bind(id),
  ];
  if (history.n) {
    // The ledger can't be edited, so keep the row and hide it everywhere.
    await env.DB.batch([...cleanup,
      env.DB.prepare("UPDATE kids SET active = 0, deleted_at = datetime('now') WHERE id = ?").bind(id)]);
    return json({ ok: true, kept_history: true });
  }
  const { avatar_key: avatar } = await env.DB.prepare('SELECT avatar_key FROM kids WHERE id = ?').bind(id).first();
  await env.DB.batch([...cleanup, env.DB.prepare('DELETE FROM kids WHERE id = ?').bind(id)]);
  if (avatar) await env.IMAGES.delete(avatar);
  return json({ ok: true, kept_history: false });
}
