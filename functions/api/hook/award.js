// POST /api/hook/award  { kid_id, delta, reason }
// For Home Assistant chores etc. Auth: X-Api-Key with the "award" scope.
import { authenticateApiKey } from '../../../lib/auth.js';
import { balanceOf, getKid, ledgerInsert } from '../../../lib/db.js';
import { json, readJson, requireInt, requireString } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  const key = await authenticateApiKey(request, env, 'award');
  const body = await readJson(request);
  const kid = await getKid(env.DB, requireString(body.kid_id, 'kid_id'));
  const delta = requireInt(body.delta, 'delta', { min: 1, max: 50 });
  const reason = requireString(body.reason, 'reason', { optional: true }) || 'Chore';

  await ledgerInsert(env.DB, { kidId: kid.id, delta, kind: 'award', reason, actor: `key:${key.name}` }).run();
  return json({ kid_id: kid.id, balance: await balanceOf(env.DB, kid.id) }, 201);
}
