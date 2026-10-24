// Builds the Santa letter as a true US Letter PDF (8.5 × 11 in), so it prints the
// same size from any iPad or printer. Everything is drawn on a canvas at 200 dpi,
// then placed full-page in the PDF.

const DPI = 200;
const W = 8.5 * DPI; // 1700
const H = 11 * DPI;  // 2200
const M = 0.55 * DPI; // safe margin, inside any printer's unprintable edge

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.jspdf) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Couldn’t load the PDF maker'));
    document.head.append(s);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load a picture for the letter'));
    img.src = src;
  });
}

function hollyImage() {
  const g = document.getElementById('holly');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 136 136">${new XMLSerializer().serializeToString(g)}</svg>`;
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function drawContained(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s; const dh = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Text in outline letters for tracing; shrinks to fit maxWidth. */
function traceText(ctx, text, x, y, size, maxWidth, align = 'left') {
  let s = size;
  ctx.font = `800 ${s}px "Baloo 2", sans-serif`;
  while (ctx.measureText(text).width > maxWidth && s > 40) { s -= 4; ctx.font = `800 ${s}px "Baloo 2", sans-serif`; }
  ctx.textAlign = align;
  ctx.lineWidth = Math.max(3, s / 30);
  ctx.strokeStyle = '#555';
  ctx.setLineDash([]);
  ctx.strokeText(text, x, y);
}

/**
 * @param {{ name: string, toys: { coloring: string }[] }} letter
 * @returns {Promise<Blob>} the PDF
 */
export async function buildLetterPdf({ name, toys }) {
  await loadScript('/vendor/jspdf-2.5.1.umd.min.js');
  try {
    await Promise.all([
      document.fonts.load('700 120px "Mountains of Christmas"'),
      document.fonts.load('700 60px "Baloo 2"'),
      document.fonts.load('800 120px "Baloo 2"'),
    ]);
  } catch { /* fall back to system fonts */ }

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#222';
  ctx.textBaseline = 'alphabetic';

  // Holly in the four corners.
  const holly = await hollyImage();
  const hs = 1.45 * DPI;
  const corner = (sx, sy, x, y) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); ctx.drawImage(holly, 0, 0, hs, hs); ctx.restore();
  };
  const inset = 0.35 * DPI;
  corner(1, 1, inset, inset);
  corner(-1, 1, W - inset, inset);
  corner(1, -1, inset, H - inset);
  corner(-1, -1, W - inset, H - inset);

  // Heading.
  ctx.font = '700 150px "Mountains of Christmas", "Baloo 2", serif';
  ctx.textAlign = 'center';
  ctx.fillText('Dear Santa,', W / 2, M + 1.0 * DPI);

  // My name is ___
  const left = M + 0.35 * DPI;
  const nameY = M + 2.05 * DPI;
  ctx.font = '700 64px "Baloo 2", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('My name is', left, nameY);
  const labelW = ctx.measureText('My name is ').width;
  traceText(ctx, name, left + labelW + 20, nameY + 6, 150, W - left - labelW - M - 40);

  ctx.font = '700 64px "Baloo 2", sans-serif';
  ctx.fillStyle = '#222';
  ctx.fillText('I would love…', left, nameY + 0.85 * DPI);

  // Coloring pictures grid.
  const top = nameY + 1.15 * DPI;
  const bottom = H - M - 1.35 * DPI;
  const gx = M + 0.2 * DPI; const gw = W - 2 * gx;
  const n = Math.max(1, toys.length);
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 0.25 * DPI;
  const cell = Math.min((gw - gap * (cols - 1)) / cols, (bottom - top - gap * (rows - 1)) / rows);
  const usedW = cols * cell + (cols - 1) * gap;
  const startX = (W - usedW) / 2;
  const imgs = await Promise.all(toys.map((t) => loadImage(t.coloring)));
  imgs.forEach((img, i) => {
    const r = Math.floor(i / cols); const col = i % cols;
    // Centre a short last row.
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rowStart = startX + ((cols - inRow) * (cell + gap)) / 2;
    drawContained(ctx, img, rowStart + col * (cell + gap), top + r * (cell + gap), cell, cell);
  });

  // Love, ___
  const signY = H - M - 0.55 * DPI;
  ctx.font = '700 70px "Baloo 2", sans-serif';
  ctx.fillStyle = '#222';
  ctx.textAlign = 'right';
  const signRight = W - M - 1.6 * DPI;
  ctx.font = '800 120px "Baloo 2", sans-serif';
  const nameW = Math.min(ctx.measureText(name).width, 3.2 * DPI);
  traceText(ctx, name, signRight, signY + 4, 120, 3.2 * DPI, 'right');
  ctx.font = '700 70px "Baloo 2", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Love,', signRight - nameW - 30, signY);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter', compress: true });
  pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, 8.5, 11, undefined, 'FAST');
  pdf.setProperties({ title: `${name}’s letter to Santa` });
  return pdf.output('blob');
}

/** Hands the PDF to the share sheet (Print is in there), or opens it if sharing files isn't supported. */
export async function shareOrOpenPdf(blob, filename) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename.replace(/\.pdf$/, '') });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) location.href = url;
}
