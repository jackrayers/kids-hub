import { randomToken } from './crypto.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

/** Stores an image in R2 under an unguessable key and returns the key. */
export async function putImage(env, prefix, bytes, mime) {
  const key = `${prefix}-${randomToken(9)}.${EXT[mime] || 'bin'}`;
  await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: mime } });
  return key;
}

/** Reads an image back from R2 as { bytes, mime }. */
export async function getImage(env, key) {
  const obj = await env.IMAGES.get(key);
  if (!obj) return null;
  return { bytes: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType || 'image/png' };
}

export async function deleteImages(env, ...keys) {
  const real = keys.filter(Boolean);
  if (real.length) await env.IMAGES.delete(real);
}
