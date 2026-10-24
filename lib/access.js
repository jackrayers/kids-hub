// Verifies the Cloudflare Access JWT (Cf-Access-Jwt-Assertion header or
// CF_Authorization cookie) against the team's public keys.
import { base64urlDecode } from './crypto.js';
import { HttpError } from './http.js';

const KEY_TTL_MS = 60 * 60 * 1000;
let keyCache = { domain: null, fetchedAt: 0, keys: [] };

async function getKeys(teamDomain, force = false) {
  const fresh = keyCache.domain === teamDomain && Date.now() - keyCache.fetchedAt < KEY_TTL_MS;
  if (fresh && !force) return keyCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError(503, 'Could not reach Cloudflare Access');
  const { keys } = await res.json();
  keyCache = { domain: teamDomain, fetchedAt: Date.now(), keys };
  return keys;
}

function decodeJsonPart(part) {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(part)));
}

export function accessTokenFrom(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? match[1] : null;
}

export async function verifyAccessJwt(token, env) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) throw new HttpError(500, 'Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)');

  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Malformed Access token');
  const [h, p, s] = parts;
  const header = decodeJsonPart(h);
  const payload = decodeJsonPart(p);
  if (header.alg !== 'RS256') throw new HttpError(401, 'Unexpected token algorithm');

  let keys = await getKeys(team);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getKeys(team, true); // keys may have rotated
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new HttpError(401, 'Unknown signing key');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, base64urlDecode(s), new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) throw new HttpError(401, 'Invalid Access token');

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) throw new HttpError(401, 'Token is for another application');
  if (payload.exp && payload.exp < now) throw new HttpError(401, 'Access session expired');
  if (payload.iss && payload.iss !== `https://${team}`) throw new HttpError(401, 'Unexpected token issuer');
  if (!payload.email) throw new HttpError(401, 'Token has no email');

  return String(payload.email).toLowerCase();
}
