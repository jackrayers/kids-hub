// PATCH  /api/admin/filaments/:id  { name?, hex?, hex2?, finish?, material?, in_stock?, sort? }
// DELETE /api/admin/filaments/:id  (past requests keep their own copy of the color)
import { HttpError, json, readJson, requireInt, requireString } from '../../../../lib/http.js';
import { requireFinish, requireHex, shapeFilament } from '../../../../lib/printshop.js';

export async function onRequestPatch({ request, env, params }) {
  const body = await readJson(request);
  const f = {};
  if ('name' in body) f.name = requireString(body.name, 'name', { max: 40 });
  if ('hex' in body) f.hex = requireHex(body.hex);
  if ('hex2' in body) f.hex2 = body.hex2 ? requireHex(body.hex2, 'hex2') : null;
  if ('finish' in body) f.finish = requireFinish(body.finish);
  if ('material' in body) f.material = requireString(body.material, 'material', { max: 20 });
  if ('in_stock' in body) f.in_stock = body.in_stock ? 1 : 0;
  if ('sort' in body) f.sort = requireInt(body.sort, 'sort', { min: 0, max: 999 });
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  const res = await env.DB.prepare(`UPDATE filaments SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => f[k]), params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Filament not found');
  return json({ filament: shapeFilament(await env.DB.prepare('SELECT * FROM filaments WHERE id = ?').bind(params.id).first()) });
}

export async function onRequestDelete({ env, params }) {
  const res = await env.DB.prepare('DELETE FROM filaments WHERE id = ?').bind(params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Filament not found');
  return json({ ok: true });
}
