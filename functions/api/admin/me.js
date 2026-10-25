// GET /api/admin/me → signed-in adult + overview counts.
import { json } from '../../../lib/http.js';

export async function onRequestGet({ env, data }) {
  const { adult } = data;
  const counts = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM households) AS households,
      (SELECT COUNT(*) FROM kids WHERE active = 1 AND deleted_at IS NULL) AS kids,
      (SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL) AS devices`).first();
  return json({ adult, counts });
}
