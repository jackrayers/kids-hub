// GET  /api/admin/api-keys
// POST /api/admin/api-keys  { name, scopes? }  → returns the key ONCE  (owner only)
import { newId, randomToken, sha256Hex } from '../../../../lib/crypto.js';
import { HttpError, json, readJson, requireString } from '../../../../lib/http.js';
import { requireOwner } from '../adults/index.js';

const KNOWN_SCOPES = ['award'];

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, scopes, created_by, created_at, revoked_at FROM api_keys ORDER BY revoked_at IS NOT NULL, created_at DESC',
  ).all();
  return json({ api_keys: results });
}

export async function onRequestPost({ request, env, data }) {
  requireOwner(data.adult);
  const body = await readJson(request);
  const name = requireString(body.name, 'name', { max: 40 });
  const scopes = (Array.isArray(body.scopes) && body.scopes.length ? body.scopes : ['award']);
  for (const s of scopes) if (!KNOWN_SCOPES.includes(s)) throw new HttpError(400, `Unknown scope "${s}"`);

  const key = `kh_${randomToken(24)}`;
  const id = newId();
  await env.DB.prepare('INSERT INTO api_keys (id, name, key_hash, scopes, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind(id, name, await sha256Hex(key), scopes.join(','), data.adult.email).run();
  return json({ api_key: { id, name, scopes, key } }, 201);
}
