// Image generation with Google's Gemini image models.
// Works with an AI Studio key (generativelanguage.googleapis.com) or a Vertex AI
// express-mode key (aiplatform.googleapis.com); tries AI Studio first and remembers
// whichever endpoint accepts the key. GEMINI_MOCK=1 returns placeholder art for local dev.
import { HttpError } from './http.js';

const DEFAULT_MODEL = 'gemini-3.1-flash-image';
let preferred = null; // 'aistudio' | 'vertex', remembered per isolate

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function endpoints(model, key) {
  return {
    aistudio: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: { 'x-goog-api-key': key },
    },
    vertex: {
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      headers: {},
    },
  };
}

const looksLikeKeyProblem = (status, message) =>
  status === 401 || status === 403 || (status === 400 && /api key|API_KEY|credential/i.test(message));

/**
 * @param env  Pages env (GEMINI_API_KEY, GEMINI_IMAGE_MODEL, GEMINI_MOCK)
 * @param opts { prompt: string, image: { bytes: ArrayBuffer|Uint8Array, mime: string }, label? }
 * @returns { bytes: Uint8Array, mime: string }
 */
export async function generateImage(env, { prompt, image, label = 'image' }) {
  if (env.GEMINI_MOCK === 'block') throw new HttpError(502, 'Gemini didn’t return an image (PROHIBITED_CONTENT)');
  if (env.GEMINI_MOCK === '1') return mockImage(label);

  const key = env.GEMINI_API_KEY;
  if (!key) throw new HttpError(500, 'GEMINI_API_KEY secret is not set on the Pages project');
  const model = env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;

  const body = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: image.mime, data: toBase64(image.bytes) } },
      ],
    }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  });

  const all = endpoints(model, key);
  const order = preferred ? [preferred, ...Object.keys(all).filter((k) => k !== preferred)] : ['aistudio', 'vertex'];
  let lastError = 'No endpoint accepted the key';

  for (const name of order) {
    const ep = all[name];
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ep.headers },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      lastError = `${name}: ${msg}`;
      if (looksLikeKeyProblem(res.status, msg)) continue; // try the other endpoint
      throw new HttpError(502, `Gemini error (${name}): ${msg}`);
    }
    preferred = name;

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    if (!imgPart) {
      const why = data.promptFeedback?.blockReason || candidate?.finishReason || 'no image in response';
      const text = parts.find((p) => p.text)?.text;
      throw new HttpError(502, `Gemini didn’t return an image (${why})${text ? `: ${text.slice(0, 160)}` : ''}`);
    }
    const inline = imgPart.inlineData || imgPart.inline_data;
    return { bytes: fromBase64(inline.data), mime: inline.mimeType || inline.mime_type || 'image/png' };
  }
  throw new HttpError(502, `Gemini rejected the API key. ${lastError}`);
}

// Placeholder art so the whole flow can be exercised without calling Google.
function mockImage(label) {
  const coloring = label === 'coloring';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ffffff"/>
  <g stroke="#222" stroke-width="${coloring ? 10 : 0}" fill="${coloring ? 'none' : '#e4483f'}">
    <rect x="136" y="200" width="240" height="200" rx="18"/>
    <rect x="116" y="160" width="280" height="60" rx="14" fill="${coloring ? 'none' : '#f5b82e'}"/>
    <path d="M256 160c-30-60-100-60-100-20 0 28 50 26 100 20zM256 160c30-60 100-60 100-20 0 28-50 26-100 20z" fill="${coloring ? 'none' : '#2e9b6a'}"/>
  </g>
  <text x="256" y="470" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#888">mock ${label}</text>
</svg>`;
  return { bytes: new TextEncoder().encode(svg), mime: 'image/svg+xml' };
}
