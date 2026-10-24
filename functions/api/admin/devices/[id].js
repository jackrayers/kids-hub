// DELETE /api/admin/devices/:id → revoke (the tablet will need to pair again).
import { HttpError, json } from '../../../../lib/http.js';

export async function onRequestDelete({ env, params }) {
  const res = await env.DB.prepare(
    `UPDATE devices SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL`,
  ).bind(params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Device not found or already revoked');
  return json({ ok: true });
}
