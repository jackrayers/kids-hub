// POST /api/admin/kids/:id/avatar   body: image/jpeg|png|webp (resized client-side)
// DELETE /api/admin/kids/:id/avatar
import { randomToken } from '../../../../../lib/crypto.js';
import { getKid } from '../../../../../lib/db.js';
import { HttpError, json } from '../../../../../lib/http.js';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;

export async function onRequestPost({ request, env, params }) {
  const kid = await getKid(env.DB, params.id);
  const type = (request.headers.get('content-type') || '').split(';')[0];
  if (!TYPES[type]) throw new HttpError(415, 'Upload a JPEG, PNG or WebP image');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'Empty image');
  if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'Image is larger than 2 MB');

  // Unguessable key: images are served without auth so <img> tags work.
  const key = `avatars/${kid.id}-${randomToken(9)}.${TYPES[type]}`;
  await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare('UPDATE kids SET avatar_key = ? WHERE id = ?').bind(key, kid.id).run();
  if (kid.avatar_key) await env.IMAGES.delete(kid.avatar_key);
  return json({ kid: await getKid(env.DB, kid.id) });
}

export async function onRequestDelete({ env, params }) {
  const kid = await getKid(env.DB, params.id);
  if (kid.avatar_key) {
    await env.DB.prepare('UPDATE kids SET avatar_key = NULL WHERE id = ?').bind(kid.id).run();
    await env.IMAGES.delete(kid.avatar_key);
  }
  return json({ kid: await getKid(env.DB, kid.id) });
}
