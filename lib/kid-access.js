import { requireKidApp } from './apps.js';
import { HttpError } from './http.js';

/** The kid must belong to the paired device's household and have the app switched on. */
export async function requireOwnKid(env, device, kidId, app) {
  if (!kidId || typeof kidId !== 'string') throw new HttpError(400, 'kid is required');
  const kid = await env.DB.prepare('SELECT id, name, household_id FROM kids WHERE id = ? AND active = 1')
    .bind(kidId).first();
  if (!kid || kid.household_id !== device.household_id) throw new HttpError(404, 'Kid not found');
  if (device.kid_id && device.kid_id !== kid.id) throw new HttpError(403, 'This tablet belongs to another kid');
  if (app) await requireKidApp(env.DB, kid.id, app);
  return kid;
}
