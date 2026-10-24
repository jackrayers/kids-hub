// PATCH /api/admin/print-requests/:id  { status: 'requested'|'printing'|'done'|'refunded', reason? }
// Refunding gives the tokens back (once).
import { newId } from '../../../../lib/crypto.js';
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';

export async function onRequestPatch({ request, env, params, data }) {
  const body = await readJson(request);
  const req = await env.DB.prepare('SELECT * FROM print_requests WHERE id = ?').bind(params.id).first();
  if (!req) throw new HttpError(404, 'Request not found');
  if (req.status === 'refunded') throw new HttpError(409, 'Already refunded');

  if (body.status === 'refunded') {
    const reason = requireString(body.reason, 'reason', { max: 120, optional: true }) || 'Couldn’t print it';
    const res = await env.DB.batch([
      env.DB.prepare(`UPDATE print_requests SET status = 'refunded', refund_reason = ?, updated_at = datetime('now')
        WHERE id = ? AND status <> 'refunded'`).bind(reason, req.id),
      env.DB.prepare(`INSERT INTO ledger (id, kid_id, delta, kind, reason, ref_type, ref_id, actor)
        SELECT ?, ?, ?, 'refund', ?, 'print_request', ?, ? WHERE changes() = 1`)
        .bind(newId(), req.kid_id, req.cost, `Refund: ${reason}`, req.id, data.adult.email),
    ]);
    if (!res[0].meta.changes) throw new HttpError(409, 'Already refunded');
    return json({ ok: true, status: 'refunded' });
  }
  if (!['requested', 'printing', 'done'].includes(body.status)) throw new HttpError(400, 'Unknown status');
  await env.DB.prepare(`UPDATE print_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`).bind(body.status, req.id).run();
  return json({ ok: true, status: body.status });
}
