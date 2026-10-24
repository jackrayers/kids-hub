// GET  /api/admin/ledger?kid_id=&limit=
// POST /api/admin/ledger  { kid_id, delta, reason?, kind? ('award' | 'adjust') }
import { balanceOf, getKid, ledgerInsert, listLedger } from '../../../lib/db.js';
import { HttpError, json, readJson, requireInt, requireString } from '../../../lib/http.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
  const entries = await listLedger(env.DB, { kidId: url.searchParams.get('kid_id'), limit });
  return json({ entries });
}

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  const kid = await getKid(env.DB, requireString(body.kid_id, 'kid_id'));
  const delta = requireInt(body.delta, 'delta', { min: -1000, max: 1000 });
  if (delta === 0) throw new HttpError(400, 'delta cannot be zero');
  const kind = body.kind ?? (delta > 0 ? 'award' : 'adjust');
  if (!['award', 'adjust'].includes(kind)) throw new HttpError(400, 'kind must be award or adjust');
  if (kind === 'award' && delta < 0) throw new HttpError(400, 'Use kind "adjust" to take tokens away');
  const reason = requireString(body.reason, 'reason', { max: 120, optional: true });

  // Don't let a manual adjustment push a balance below zero.
  if (delta < 0 && (await balanceOf(env.DB, kid.id)) + delta < 0) {
    throw new HttpError(400, `${kid.name} only has ${kid.balance} tokens`);
  }
  await ledgerInsert(env.DB, { kidId: kid.id, delta, kind, reason, actor: data.adult.email }).run();
  return json({ kid_id: kid.id, balance: await balanceOf(env.DB, kid.id) }, 201);
}
