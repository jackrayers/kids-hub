// POST /api/kid/print-requests  { kid_id, model_id, colors: { [extruder]: filament_id } }
// Spends the tokens and queues the print (refused if the balance is too low).
import { visibleBinds, visibleSql } from '../../../lib/audience.js';
import { newId } from '../../../lib/crypto.js';
import { balanceOf } from '../../../lib/db.js';
import { HttpError, json, readJson, requireString } from '../../../lib/http.js';
import { requireOwnKid } from '../../../lib/kid-access.js';
import { notifyHomeAssistant, priceFor, shapeModel } from '../../../lib/printshop.js';

export async function onRequestPost({ request, env, data, waitUntil }) {
  const body = await readJson(request);
  const kid = await requireOwnKid(env, data.device, body.kid_id, 'print');
  const modelId = requireString(body.model_id, 'model_id');
  const row = await env.DB.prepare(`SELECT m.* FROM models m WHERE m.id = ? AND m.status = 'approved' AND ${visibleSql('m')}`)
    .bind(modelId, ...visibleBinds('model', kid)).first();
  if (!row) throw new HttpError(404, 'That model isn’t in the shop');
  const model = shapeModel(row);

  // Every slot needs an in-stock filament.
  const { results: stock } = await env.DB.prepare('SELECT * FROM filaments WHERE in_stock = 1').all();
  const byId = Object.fromEntries(stock.map((f) => [f.id, f]));
  const chosen = body.colors && typeof body.colors === 'object' ? body.colors : {};
  const colors = model.slots.map((s) => {
    const f = byId[chosen[s.extruder]];
    if (!f) throw new HttpError(400, `Pick a color for ${s.name}`);
    return { extruder: s.extruder, slot: s.name, filament_id: f.id, name: f.name, hex: f.hex };
  });
  const { multi, cost } = priceFor(model, colors.map((c) => c.filament_id));

  const id = newId();
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT INTO print_requests (id, kid_id, model_id, colors, multi, cost)
      SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(delta), 0) FROM ledger WHERE kid_id = ?) >= ?`)
      .bind(id, kid.id, model.id, JSON.stringify(colors), multi ? 1 : 0, cost, kid.id, cost),
    env.DB.prepare(`INSERT INTO ledger (id, kid_id, delta, kind, reason, ref_type, ref_id, actor)
      SELECT ?, ?, ?, 'spend', ?, 'print_request', ?, ? WHERE changes() = 1`)
      .bind(newId(), kid.id, -cost, `Print: ${model.title}`, id, `device:${data.device.id}`),
  ]);
  if (!res[0].meta.changes) throw new HttpError(402, `You need ${cost} stars for this one`);

  notifyHomeAssistant(env, waitUntil, {
    event: 'kids_hub_print_request',
    kid: kid.name, model: model.title, cost, multi,
    colors: colors.map((c) => `${c.slot}: ${c.name}`).join(', '),
    message: `${kid.name} spent ${cost}⭐ on a ${model.title} (${colors.map((c) => c.name).join(' / ')})`,
  });
  return json({ ok: true, id, cost, balance: await balanceOf(env.DB, kid.id) }, 201);
}
