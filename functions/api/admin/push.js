// GET    /api/admin/push            → { publicKey, devices: [this adult's alert devices] }
// POST   /api/admin/push            { subscription: PushSubscriptionJSON, label? } → save this device
// DELETE /api/admin/push            { endpoint } → stop alerts on that device
// POST   /api/admin/push?test=1     → send a test alert to this adult's devices
import { newId } from '../../../lib/crypto.js';
import { HttpError, json, readJson, requireString } from '../../../lib/http.js';
import { getVapid, pushToAdults } from '../../../lib/webpush.js';

async function listDevices(env, email) {
  const { results } = await env.DB.prepare(
    'SELECT id, endpoint, label, created_at, last_sent_at FROM push_subscriptions WHERE adult_email = ? ORDER BY created_at',
  ).bind(email).all();
  return results;
}

export async function onRequestGet({ env, data }) {
  const vapid = await getVapid(env);
  return json({ publicKey: vapid.publicKey, devices: await listDevices(env, data.adult.email) });
}

export async function onRequestPost({ request, env, data }) {
  const email = data.adult.email;
  if (new URL(request.url).searchParams.get('test')) {
    const res = await pushToAdults(env, {
      title: 'Kids Hub alerts are on 🎉',
      body: 'You’ll get a ping here when a kid spends stars in the Print Shop.',
      url: '/admin/#print', tag: 'test',
    }, { emails: [email] });
    if (!res.sent && !res.removed && !res.failed) throw new HttpError(400, 'Turn on alerts on this device first');
    return json(res);
  }
  const body = await readJson(request);
  const sub = body.subscription || {};
  const endpoint = requireString(sub.endpoint, 'subscription.endpoint', { max: 1000 });
  if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, 'Bad push endpoint');
  const p256dh = requireString(sub.keys?.p256dh, 'subscription.keys.p256dh', { max: 200 });
  const auth = requireString(sub.keys?.auth, 'subscription.keys.auth', { max: 100 });
  const label = typeof body.label === 'string' ? body.label.slice(0, 60) : null;
  await env.DB.prepare(`INSERT INTO push_subscriptions (id, adult_email, endpoint, p256dh, auth, label) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET adult_email = excluded.adult_email, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label`)
    .bind(newId(), email, endpoint, p256dh, auth, label).run();
  return json({ ok: true, devices: await listDevices(env, email) }, 201);
}

export async function onRequestDelete({ request, env, data }) {
  const body = await readJson(request);
  const endpoint = requireString(body.endpoint, 'endpoint', { max: 1000 });
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND adult_email = ?').bind(endpoint, data.adult.email).run();
  return json({ ok: true, devices: await listDevices(env, data.adult.email) });
}
