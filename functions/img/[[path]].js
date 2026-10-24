// GET /img/<r2 key> → image from R2. Keys are unguessable, so no auth (img tags can't send headers).
export async function onRequestGet({ env, params, request }) {
  const key = (params.path || []).join('/');
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  const obj = await env.IMAGES.get(key, { onlyIf: request.headers });
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}
