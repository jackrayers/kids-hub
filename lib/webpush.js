// Web Push with nothing but WebCrypto: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
// The VAPID key pair is made on first use and kept in the settings table, so there's no
// secret to set up. Subscriptions that the push service says are gone (404/410) are deleted.

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** { publicKey (base64url raw P-256 point), privateJwk } — created once. */
export async function getVapid(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'").first();
  if (row) return JSON.parse(row.value);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapid = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  // If two requests race, the first one wins and both use it.
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(vapid)).run();
  return JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'").first()).value);
}

async function vapidHeader(vapid, endpoint, subject) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Encrypts a payload for one subscription (RFC 8291, single aes128gcm record). */
export async function encryptPayload(p256dh, auth, plaintext) {
  const uaPublic = unb64url(p256dh);
  const authSecret = unb64url(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = concat(enc.encode(plaintext), new Uint8Array([2])); // 0x02 = last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, body));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Sends one push. Returns 'ok' | 'gone' | 'error:<status>'. */
export async function sendPush(env, vapid, sub, payload, { ttl = 86400, urgency = 'high' } = {}) {
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(payload));
  const subject = env.OWNER_EMAIL ? `mailto:${env.OWNER_EMAIL}` : 'mailto:noreply@jackrayers.com';
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(vapid, sub.endpoint, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
  if (res.ok) return 'ok';
  if (res.status === 404 || res.status === 410) return 'gone';
  return `error:${res.status}`;
}

/**
 * Pushes { title, body, url, tag } to every subscribed grown-up (or only `emails`).
 * Returns { sent, removed, failed }.
 */
export async function pushToAdults(env, payload, { emails } = {}) {
  const { results: subs } = emails?.length
    ? await env.DB.prepare(`SELECT * FROM push_subscriptions WHERE adult_email IN (${emails.map(() => '?').join(',')})`).bind(...emails).all()
    : await env.DB.prepare('SELECT * FROM push_subscriptions').all();
  if (!subs.length) return { sent: 0, removed: 0, failed: 0 };
  const vapid = await getVapid(env);
  const outcome = await Promise.all(subs.map((s) => sendPush(env, vapid, s, payload).catch(() => 'error')));
  const gone = subs.filter((_, i) => outcome[i] === 'gone').map((s) => s.id);
  const ok = subs.filter((_, i) => outcome[i] === 'ok').map((s) => s.id);
  const stmts = [];
  if (gone.length) stmts.push(env.DB.prepare(`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => '?').join(',')})`).bind(...gone));
  if (ok.length) stmts.push(env.DB.prepare(`UPDATE push_subscriptions SET last_sent_at = datetime('now') WHERE id IN (${ok.map(() => '?').join(',')})`).bind(...ok));
  if (stmts.length) await env.DB.batch(stmts);
  return { sent: ok.length, removed: gone.length, failed: subs.length - ok.length - gone.length, outcomes: outcome };
}
