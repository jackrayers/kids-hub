// Turns a toy picture into a simple black-and-white coloring page, in the browser.
// Used when Gemini won't draw the toy. Best with a cutout (transparent background):
// the toy's silhouette becomes a thick outer line, and strong colour edges inside
// become thinner lines.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load the picture for the coloring page'));
    img.src = src;
  });
}

export async function makeLineArt(src, { size = 768, detail = 0.8 } = {}) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.96;
  const dw = img.naturalWidth * scale; const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  const { data } = ctx.getImageData(0, 0, size, size);
  const n = size * size;

  // Luminance (transparent → white) and a solid/empty mask from alpha.
  const lum = new Float32Array(n);
  const solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4; const a = data[i + 3] / 255;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[p] = l * a + 255 * (1 - a);
    solid[p] = data[i + 3] > 128 ? 1 : 0;
  }

  // Light blur to drop texture noise.
  const blur = (src2) => {
    const out = new Float32Array(n);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let s = 0; let k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) { s += src2[ny * size + nx]; k++; }
        }
        out[y * size + x] = s / k;
      }
    }
    return out;
  };
  const g = blur(blur(lum));

  // Sobel edge strength.
  const mag = new Float32Array(n);
  const values = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const p = y * size + x;
      const gx = -g[p - size - 1] - 2 * g[p - 1] - g[p + size - 1] + g[p - size + 1] + 2 * g[p + 1] + g[p + size + 1];
      const gy = -g[p - size - 1] - 2 * g[p - size] - g[p - size + 1] + g[p + size - 1] + 2 * g[p + size] + g[p + size + 1];
      mag[p] = Math.hypot(gx, gy);
      if (mag[p] > 8) values.push(mag[p]);
    }
  }
  values.sort((a, b) => a - b);
  const threshold = Math.max(60, values[Math.floor(values.length * detail)] || 60);

  // Inner lines from edges; outer line from the silhouette.
  const line = new Uint8Array(n);
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const p = y * size + x;
      if (mag[p] >= threshold) line[p] = 1;
      if (solid[p]) {
        for (let dy = -2; dy <= 2 && !line[p]; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (!solid[p + dy * size + dx]) { line[p] = 2; break; }
        }
      }
    }
  }

  // Drop lone specks, then thicken lines a touch.
  const clean = new Uint8Array(n);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const p = y * size + x;
      if (!line[p]) continue;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && line[p + dy * size + dx]) nb++;
      if (nb >= 2 || line[p] === 2) clean[p] = 1;
    }
  }
  const out = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      let ink = clean[p];
      if (!ink && x > 0 && y > 0 && x < size - 1 && y < size - 1) {
        ink = clean[p - 1] || clean[p + 1] || clean[p - size] || clean[p + size];
      }
      const v = ink ? 20 : 255;
      out.data.set([v, v, v, 255], p * 4);
    }
  }
  ctx.putImageData(out, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
