// GET /api/kid/print-shop?kid=<id> → models this kid can see, in-stock filaments, balance, their recent requests.
import { visibleBinds, visibleSql } from '../../../lib/audience.js';
import { balanceOf } from '../../../lib/db.js';
import { json } from '../../../lib/http.js';
import { requireOwnKid } from '../../../lib/kid-access.js';
import { shapeFilament, shapeModel, shapeRequest } from '../../../lib/printshop.js';

export async function onRequestGet({ request, env, data }) {
  const kid = await requireOwnKid(env, data.device, new URL(request.url).searchParams.get('kid'), 'print');
  const [models, filaments, reqs] = await env.DB.batch([
    env.DB.prepare(`SELECT m.* FROM models m WHERE m.status = 'approved' AND ${visibleSql('m')} ORDER BY m.sort, m.created_at DESC`)
      .bind(...visibleBinds('model', kid)),
    env.DB.prepare('SELECT * FROM filaments WHERE in_stock = 1 ORDER BY sort, name'),
    env.DB.prepare(`SELECT r.*, m.title AS model_title, m.thumb_key FROM print_requests r JOIN models m ON m.id = r.model_id
      WHERE r.kid_id = ? ORDER BY r.created_at DESC LIMIT 12`).bind(kid.id),
  ]);
  return json({
    kid: { id: kid.id, name: kid.name },
    balance: await balanceOf(env.DB, kid.id),
    models: models.results.map((r) => {
      const m = shapeModel(r);
      return { id: m.id, title: m.title, thumb: m.thumb, preview: m.preview, slots: m.slots, price_single: m.price_single, price_multi: m.price_multi };
    }),
    filaments: filaments.results.map(shapeFilament),
    requests: reqs.results.map((r) => {
      const x = shapeRequest(r);
      return { id: x.id, model_title: x.model_title, thumb: x.thumb, colors: x.colors, cost: x.cost, status: x.status, created_at: x.created_at };
    }),
  });
}
