// GET  /api/admin/filaments
// POST /api/admin/filaments  { name, hex, finish?, hex2?, material?, in_stock? }
import { newId } from '../../../../lib/crypto.js';
import { json, readJson, requireString } from '../../../../lib/http.js';
import { requireFinish, requireHex, shapeFilament } from '../../../../lib/printshop.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM filaments ORDER BY in_stock DESC, sort, name').all();
  return json({ filaments: results.map(shapeFilament) });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const id = newId();
  const name = requireString(body.name, 'name', { max: 40 });
  const hex = requireHex(body.hex);
  const material = requireString(body.material, 'material', { max: 20, optional: true }) || 'PLA';
  const finish = requireFinish(body.finish);
  const hex2 = body.hex2 ? requireHex(body.hex2, 'hex2') : null;
  await env.DB.prepare('INSERT INTO filaments (id, name, hex, hex2, finish, material, in_stock) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, hex, hex2, finish, material, body.in_stock === false ? 0 : 1).run();
  return json({ filament: shapeFilament(await env.DB.prepare('SELECT * FROM filaments WHERE id = ?').bind(id).first()) }, 201);
}
