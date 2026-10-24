// GET /img/<r2 key> → image from R2. Keys are unguessable, so no auth (img tags can't send headers).
// Keys never change content (new pictures get new keys), so responses are cached at
// Cloudflare's edge and in the browser for a year.
export async function onRequestGet({ env, params, request, waitUntil }) {
  const key = (params.path || []).join('/');
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const res = new Response(obj.body, { headers });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
