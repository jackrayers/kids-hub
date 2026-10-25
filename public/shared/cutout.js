// Cuts a toy out of its plain white background, in the browser.
// Flood-fills the background from the picture's edges (so white parts *inside*
// the toy survive), softens the edge, then trims and stands the toy on the
// bottom of a square so every toy sits on the shelf the same way.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load the picture to cut out'));
    img.src = src;
  });
}

const idle = () => new Promise((r) => setTimeout(r, 0)); // let the page breathe between heavy steps

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Loads a picture onto a canvas (at most 1024px). Returns { w, h, orig } with orig = RGBA copy. */
export async function loadForCutout(src) {
  const img = await loadImage(src);
  const fit = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * fit);
  const h = Math.round(img.naturalHeight * fit);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, orig: new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data) };
}

/**
 * The automatic background removal on its own: flood-fills the plain background in from the
 * edges (white parts *inside* the toy survive), softens the edge and un-mixes the white fringe.
 * Returns { rgba (new array), removed (share of pixels), bgLight, bbox }.
 */
export function autoCutout(orig, w, h, { tolerance = 34, soft = 72 } = {}) {
  const px = new Uint8ClampedArray(orig);
  // Background colour = median of the border pixels.
  const rs = []; const gs = []; const bs = [];
  const sample = (x, y) => { const i = (y * w + x) * 4; rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); };
  for (let x = 0; x < w; x += 3) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += 3) { sample(0, y); sample(w - 1, y); }
  const br = median(rs); const bg = median(gs); const bb = median(bs);
  const dist = (i) => Math.hypot(px[i] - br, px[i + 1] - bg, px[i + 2] - bb);

  const isBg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0; let tail = 0;
  const seed = (x, y) => {
    const p = y * w + x;
    if (!isBg[p] && dist(p * 4) < tolerance) { isBg[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w; const y = (p - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  const removed = tail / (w * h);

  // Pixels within 2px of the background form the edge band.
  const band = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBg[y * w + x]) continue;
      for (let dx = -2; dx <= 2; dx++) { const nx = x + dx; if (nx >= 0 && nx < w) band[y * w + nx] = 1; }
    }
  }
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!band[y * w + x]) continue;
      for (let dy = -2; dy <= 2; dy++) { const ny = y + dy; if (ny >= 0 && ny < h) near[ny * w + x] = 1; }
    }
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (isBg[p]) { px[i + 3] = 0; continue; }
    if (near[p]) {
      const d = dist(i);
      const a = Math.min(1, Math.max(0, (d - tolerance * 0.5) / (soft - tolerance * 0.5)));
      if (a < 1 && a > 0) {
        px[i] = Math.min(255, Math.max(0, (px[i] - br * (1 - a)) / a));
        px[i + 1] = Math.min(255, Math.max(0, (px[i + 1] - bg * (1 - a)) / a));
        px[i + 2] = Math.min(255, Math.max(0, (px[i + 2] - bb * (1 - a)) / a));
      }
      px[i + 3] = Math.round(a * 255);
    }
  }
  return { rgba: px, removed, bgLight: (br + bg + bb) / 3 > 215 };
}

/** Trims to what's visible and stands it on the bottom of a square; returns a WebP (or PNG) blob. */
export async function finishCutout(rgba, w, h, { size = 768, padding = 0.025 } = {}) {
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  if (maxX >= 0) {
    const bw = maxX - minX + 1; const bh = maxY - minY + 1;
    const room = size * (1 - padding * 2);
    const scale = Math.min(room / bw, room / bh);
    const dw = bw * scale; const dh = bh * scale;
    const dx = (size - dw) / 2;
    const dy = size - size * padding * 0.5 - dh; // sits near the bottom edge
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, minX, minY, bw, bh, dx, dy, dw, dh);
  }
  // WebP keeps transparency at a fraction of PNG's size; browsers that can't encode it give PNG.
  let blob = await new Promise((res) => out.toBlob(res, 'image/webp', 0.9));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  return { blob, empty: maxX < 0 };
}

/**
 * @returns {Promise<{ blob: Blob, ok: boolean, removed: number, reason?: string }>}
 *   ok=false means the result looks wrong and shouldn't be used without a look.
 */
export async function makeCutout(src, { size = 768, tolerance = 34, soft = 72, padding = 0.025 } = {}) {
  const { w, h, orig } = await loadForCutout(src);
  await idle();
  const { rgba, removed, bgLight } = autoCutout(orig, w, h, { tolerance, soft });
  await idle();
  const { blob, empty } = await finishCutout(rgba, w, h, { size, padding });
  let ok = true; let reason;
  if (!bgLight) { ok = false; reason = 'The background isn’t plain white'; }
  else if (removed < 0.12) { ok = false; reason = 'Hardly any background was found'; }
  else if (removed > 0.97 || empty) { ok = false; reason = 'Almost everything was removed'; }
  return { blob, ok, removed, reason };
}
