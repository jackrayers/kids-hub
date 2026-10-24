// GET /api/kid/household → the paired device's household and its kids (with balances).
import { listKids } from '../../../lib/db.js';
import { json } from '../../../lib/http.js';

export async function onRequestGet({ env, data }) {
  const { device } = data;
  const household = await env.DB.prepare('SELECT id, name FROM households WHERE id = ?')
    .bind(device.household_id).first();
  const kids = await listKids(env.DB, { householdId: device.household_id });
  return json({
    device: { id: device.id, name: device.name },
    household,
    kids: kids.map(({ id, name, emoji, color, avatar_url, ui_mode, balance }) =>
      ({ id, name, emoji, color, avatar_url, ui_mode, balance })),
  });
}
