// GET /api/kid/kids/:id/ledger → a kid's recent token history (own household only).
import { balanceOf, listLedger } from '../../../../../lib/db.js';
import { json } from '../../../../../lib/http.js';
import { requireOwnKid } from '../../../../../lib/kid-access.js';

export async function onRequestGet({ env, data, params }) {
  const kid = await requireOwnKid(env, data.device, params.id);
  const entries = await listLedger(env.DB, { kidId: kid.id, limit: 30 });
  return json({
    balance: await balanceOf(env.DB, kid.id),
    entries: entries.map(({ id, delta, kind, reason, created_at }) => ({ id, delta, kind, reason, created_at })),
  });
}
