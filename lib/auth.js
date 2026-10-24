import { accessTokenFrom, verifyAccessJwt } from './access.js';
import { sha256Hex } from './crypto.js';
import { HttpError } from './http.js';

const isLocal = (request) => {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

/** Adult signed in through Cloudflare Access. Returns the adults row. */
export async function authenticateAdult(request, env) {
  let email;
  if (env.DEV_ADMIN_EMAIL && isLocal(request)) {
    email = env.DEV_ADMIN_EMAIL.toLowerCase(); // local `wrangler pages dev` only
  } else {
    const token = accessTokenFrom(request);
    if (!token) throw new HttpError(401, 'Sign in through Cloudflare Access');
    email = await verifyAccessJwt(token, env);
  }

  let adult = await env.DB.prepare('SELECT * FROM adults WHERE email = ?').bind(email).first();

  // Bootstrap: the owner email (env var) becomes owner on first sign-in.
  if (!adult && env.OWNER_EMAIL && email === env.OWNER_EMAIL.toLowerCase()) {
    await env.DB.prepare("INSERT INTO adults (email, role) VALUES (?, 'owner')").bind(email).run();
    adult = await env.DB.prepare('SELECT * FROM adults WHERE email = ?').bind(email).first();
  }
  if (!adult) throw new HttpError(403, `${email} is not on the grown-ups list yet`);
  return adult;
}

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

/** Paired kid tablet. Returns the devices row. */
export async function authenticateDevice(request, env) {
  const token = bearer(request);
  if (!token) throw new HttpError(401, 'This device is not paired');
  const hash = await sha256Hex(token);
  const device = await env.DB
    .prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(hash).first();
  if (!device) throw new HttpError(401, 'This device is not paired');

  // Record last_seen at most every 10 minutes to keep writes low.
  const stale = !device.last_seen || Date.now() - Date.parse(device.last_seen.replace(' ', 'T') + 'Z') > 10 * 60 * 1000;
  if (stale) {
    await env.DB.prepare("UPDATE devices SET last_seen = datetime('now') WHERE id = ?").bind(device.id).run();
  }
  return device;
}

/** Integration key (e.g. Home Assistant). Returns the api_keys row. */
export async function authenticateApiKey(request, env, scope) {
  const key = request.headers.get('X-Api-Key') || bearer(request);
  if (!key) throw new HttpError(401, 'API key required');
  const hash = await sha256Hex(key);
  const row = await env.DB
    .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL')
    .bind(hash).first();
  if (!row) throw new HttpError(401, 'Invalid API key');
  const scopes = row.scopes.split(',').map((s) => s.trim());
  if (scope && !scopes.includes(scope)) throw new HttpError(403, `Key lacks the "${scope}" scope`);
  return row;
}
