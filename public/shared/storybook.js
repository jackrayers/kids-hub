// "Storybook look" for toys Gemini won't paint: turns a cut-out product photo into
// something closer to a watercolor illustration, in the browser. Nothing is redrawn —
// it's a filter over the real photo, so it works for any toy.
//
// Steps: painterly smoothing (Kuwahara, two passes) → softer, lighter colours →
// pigment pooling at colour edges and around the outline → paper grain → a slightly
// wobbly hand-painted edge. Transparency is kept.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load the picture for the storybook look'));
    img.src = src;
  });
}
const idle = () => new Promise((r) => setTimeout(r, 0));

// Smooth value noise for grain and edge wobble.
function makeNoise(seed = 7) {
  const perm = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const val = (x, y) => perm[perm[x & 255] + (y & 255)] / 255;
  return (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const xf = x - xi; const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
    const a = val(xi, yi); const b = val(xi + 1, yi); const c = val(xi, yi + 1); const d = val(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Kuwahara filter on premultiplied RGBA using summed-area tables. Returns new RGB (alpha untouched). */
export function kuwahara(px, w, h, r) {
  const W = w + 1;
  const sat = Array.from({ length: 5 }, () => new Float64Array(W * (h + 1))); // r g b lum lum² (all × alpha), alpha
  const satA = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    const rs = [0, 0, 0, 0, 0]; let ra = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const a = px[i + 3] / 255;
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      rs[0] += px[i] * a; rs[1] += px[i + 1] * a; rs[2] += px[i + 2] * a; rs[3] += l * a; rs[4] += l * l * a; ra += a;
      const o = (y + 1) * W + x + 1;
      for (let k = 0; k < 5; k++) sat[k][o] = sat[k][o - W] + rs[k];
      satA[o] = satA[o - W] + ra;
    }
  }
  const box = (t, x0, y0, x1, y1) => t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0];
  const out = new Uint8ClampedArray(px.length);
  const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[i + 3] = px[i + 3];
      if (!px[i + 3]) continue;
      let best = Infinity; let br = 0; let bg = 0; let bb = 0;
      // Four overlapping quadrants around the pixel; take the calmest one's mean.
      for (let q = 0; q < 4; q++) {
        const x0 = cl(q & 1 ? x : x - r, 0, w); const x1 = cl(q & 1 ? x + r + 1 : x + 1, 0, w);
        const y0 = cl(q & 2 ? y : y - r, 0, h); const y1 = cl(q & 2 ? y + r + 1 : y + 1, 0, h);
        const a = box(satA, x0, y0, x1, y1);
        if (a < 0.5) continue;
        const m = box(sat[3], x0, y0, x1, y1) / a;
        const variance = box(sat[4], x0, y0, x1, y1) / a - m * m;
        if (variance < best) {
          best = variance;
          br = box(sat[0], x0, y0, x1, y1) / a; bg = box(sat[1], x0, y0, x1, y1) / a; bb = box(sat[2], x0, y0, x1, y1) / a;
        }
      }
      if (best === Infinity) { out[i] = px[i]; out[i + 1] = px[i + 1]; out[i + 2] = px[i + 2]; } else { out[i] = br; out[i + 1] = bg; out[i + 2] = bb; }
    }
  }
  return out;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h); const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / (2 * r + 1);
      s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * @param {string} src  image URL (ideally a cutout with a transparent background)
 * @returns {Promise<Blob>} WebP (PNG fallback) with transparency, same size as the input (max 1024px)
 */
export async function makeStorybook(src, { strength = 1 } = {}) {
  const img = await loadImage(src);
  const fit = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * fit); const h = Math.round(img.naturalHeight * fit);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const n = w * h;
  const r = Math.max(2, Math.round((Math.max(w, h) / 150) * strength));
  await idle();

  // 1. Painterly smoothing: flattens photo detail into soft patches but keeps edges.
  let px = kuwahara(image.data, w, h, r);
  await idle();
  px = kuwahara(px, w, h, Math.max(1, Math.round(r / 2)));
  await idle();
  // Let neighbouring washes bleed a little so the Kuwahara patches lose their square corners.
  for (let ch = 0; ch < 3; ch++) {
    const plane = new Float32Array(n);
    for (let p = 0; p < n; p++) plane[p] = px[p * 4 + ch];
    const soft = boxBlur(plane, w, h, Math.max(1, Math.round(r / 3)));
    for (let p = 0; p < n; p++) if (px[p * 4 + 3]) px[p * 4 + ch] = plane[p] * 0.45 + soft[p] * 0.55;
  }
  await idle();

  // 2. Colour edges (for pigment pooling) and an outline rim from the alpha mask.
  const lum = new Float32Array(n); const alpha = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    lum[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    alpha[p] = px[i + 3] / 255;
  }
  const edge = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx = lum[p - w + 1] + 2 * lum[p + 1] + lum[p + w + 1] - lum[p - w - 1] - 2 * lum[p - 1] - lum[p + w - 1];
      const gy = lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1] - lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1];
      edge[p] = Math.min(1, Math.hypot(gx, gy) / 260);
    }
  }
  const softEdge = boxBlur(edge, w, h, 1);
  const rimR = Math.max(2, Math.round(Math.max(w, h) / 220));
  const aBlur = boxBlur(alpha, w, h, rimR);
  await idle();

  // 3. Paint: lighter, softer colours, pooled edges, paper grain, wobbly outline.
  const noise = makeNoise(11);
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const wob = Math.max(1, Math.max(w, h) / 380);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x; const i = p * 4;
      // Hand-painted edge: sample the pixel from a slightly displaced spot.
      const dx = (noise(x / 9, y / 9) - 0.5) * 2 * wob; const dy = (noise(x / 9 + 40, y / 9 + 17) - 0.5) * 2 * wob;
      const sx = Math.min(w - 1, Math.max(0, Math.round(x + dx))); const sy = Math.min(h - 1, Math.max(0, Math.round(y + dy)));
      const sp = sy * w + sx; const si = sp * 4;
      const a = px[si + 3];
      if (!a) continue;
      let R = px[si]; let G = px[si + 1]; let B = px[si + 2];
      // Softer saturation, lifted toward warm paper (watercolour is translucent).
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      R = L + (R - L) * 0.86; G = L + (G - L) * 0.86; B = L + (B - L) * 0.86;
      R += (252 - R) * 0.1; G += (247 - G) * 0.1; B += (236 - B) * 0.1;
      // Pigment pools where colours meet and around the outline.
      const rim = alpha[sp] > 0.5 ? Math.max(0, Math.min(1, (1 - aBlur[sp]) * 2.2)) : 0;
      const pool = 1 - 0.2 * softEdge[sp] - 0.14 * rim;
      // Paper grain: fine + blotchy; stronger in darker washes.
      const g = 0.62 * noise(x / 2.2, y / 2.2) + 0.38 * noise(x / 14 + 9, y / 14 + 3);
      const grain = 1 + (g - 0.5) * (0.09 + 0.07 * (1 - L / 255));
      o[i] = R * pool * grain; o[i + 1] = G * pool * grain; o[i + 2] = B * pool * grain;
      o[i + 3] = a;
    }
  }
  ctx.putImageData(out, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.9));
  return blob && blob.type === 'image/webp' ? blob : new Promise((res) => c.toBlob(res, 'image/png'));
}
