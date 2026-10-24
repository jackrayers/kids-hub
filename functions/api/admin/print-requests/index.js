// GET /api/admin/print-requests?status=open|all
import { json } from '../../../../lib/http.js';
import { shapeRequest } from '../../../../lib/printshop.js';

export async function onRequestGet({ request, env }) {
  const which = new URL(request.url).searchParams.get('status') || 'open';
  const where = which === 'all' ? '' : `WHERE r.status IN ('requested', 'printing')`;
  const { results } = await env.DB.prepare(`
    SELECT r.*, k.name AS kid_name, h.name AS household_name, m.title AS model_title, m.thumb_key
    FROM print_requests r
    JOIN kids k ON k.id = r.kid_id
    JOIN households h ON h.id = k.household_id
    JOIN models m ON m.id = r.model_id
    ${where}
    ORDER BY CASE r.status WHEN 'printing' THEN 0 WHEN 'requested' THEN 1 ELSE 2 END, r.created_at ${which === 'all' ? 'DESC' : 'ASC'}
    LIMIT 200`).all();
  return json({ requests: results.map(shapeRequest) });
}
