// Pull a product's name and main photo from its web page (Open Graph / Twitter tags).
// Many big retailers block automated fetches; callers fall back to a photo upload.
import { HttpError } from './http.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAX_HTML = 600_000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      'i',
    );
    const m = html.match(re);
    if (m) return decodeEntities((m[1] || m[2]).trim());
  }
  return null;
}

export function parseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new HttpError(400, 'That doesn’t look like a web address'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Use an http(s) link');
  return url;
}

/** Returns { title, imageUrl } from a product page. */
export async function readProductPage(rawUrl) {
  const url = parseUrl(rawUrl);
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
      redirect: 'follow',
    });
  } catch {
    throw new HttpError(422, 'Couldn’t reach that page. Upload a photo of the toy instead.');
  }
  if (!res.ok) throw new HttpError(422, `That shop blocked the request (HTTP ${res.status}). Upload a photo of the toy instead.`);
  const html = (await res.text()).slice(0, MAX_HTML);

  const title = metaContent(html, ['og:title', 'twitter:title'])
    || decodeEntities((html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim()) || null;
  const image = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
  if (!image) throw new HttpError(422, 'Couldn’t find a product photo on that page. Upload a photo of the toy instead.');
  return { title, imageUrl: new URL(image, res.url || url).toString() };
}

/** Downloads an image and checks its type and size. Returns { bytes, mime }. */
export async function downloadImage(imageUrl) {
  const url = parseUrl(imageUrl);
  let res;
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'image/jpeg,image/png,image/webp' } });
  } catch {
    throw new HttpError(422, 'Couldn’t download the product photo. Upload a photo instead.');
  }
  if (!res.ok) throw new HttpError(422, `Couldn’t download the product photo (HTTP ${res.status}). Upload a photo instead.`);
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES[mime]) throw new HttpError(422, `The product photo is a ${mime || 'unknown'} file. Upload a JPEG or PNG instead.`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, 'The product photo is too large. Upload a smaller photo instead.');
  return { bytes, mime };
}
