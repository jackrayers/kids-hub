// Crops the empty white margin off a picture and centres what's left in a square,
// so coloring pages fill their space on the letter.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load the picture to trim'));
    img.src = src;
  });
}

export async function trimToSquare(src, { size = 768, padding = 0.04, threshold = 236 } = {}) {
  const img = await loadImage(src);
  const w = img.naturalWidth; const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Bounding box of anything noticeably darker than white (ignores faint specks at the edges).
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < threshold) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const o = out.getContext('2d');
  o.fillStyle = '#fff';
  o.fillRect(0, 0, size, size);
  if (maxX >= 0) {
    const bw = maxX - minX + 1; const bh = maxY - minY + 1;
    const room = size * (1 - padding * 2);
    const scale = Math.min(room / bw, room / bh);
    const dw = bw * scale; const dh = bh * scale;
    o.imageSmoothingQuality = 'high';
    o.drawImage(c, minX, minY, bw, bh, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
  return new Promise((res) => out.toBlob(res, 'image/png'));
}
