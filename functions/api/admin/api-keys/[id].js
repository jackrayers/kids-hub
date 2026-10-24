// DELETE /api/admin/api-keys/:id → revoke (owner only)
import { HttpError, json } from '../../../../lib/http.js';
import { requireOwner } from '../adults/index.js';

export async function onRequestDelete({ env, data, params }) {
  requireOwner(data.adult);
  const res = await env.DB.prepare(
    `UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL`,
  ).bind(params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Key not found or already revoked');
  return json({ ok: true });
}
