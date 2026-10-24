// GET /api/kid/kids/:id/ledger → a kid's recent token history (own household only).
import { balanceOf, getKid, listLedger } from '../../../../../lib/db.js';
import { HttpError, json } from '../../../../../lib/http.js';

export async function onRequestGet({ env, data, params }) {
  const kid = await getKid(env.DB, params.id);
  if (kid.household_id !== data.device.household_id) throw new HttpError(404, 'Kid not found');
  const entries = await listLedger(env.DB, { kidId: kid.id, limit: 30 });
  return json({
    balance: await balanceOf(env.DB, kid.id),
    entries: entries.map(({ id, delta, kind, reason, created_at }) => ({ id, delta, kind, reason, created_at })),
  });
}
