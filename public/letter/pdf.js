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

import { borderSvg } from './border.js';

function borderImage() {
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(borderSvg())}`);
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

  // Colour-in border all the way round (same drawing as the on-screen preview).
  ctx.drawImage(await borderImage(), 0, 0, W, H);

  // Heading and the ask, in the storybook Christmas font.
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.font = '700 160px "Mountains of Christmas", "Baloo 2", serif';
  ctx.fillText('Dear Santa,', W / 2, 2.05 * DPI);
  const ask = 'This Christmas, please can I have…';
  let askSize = 98;
  const askFont = () => `700 ${askSize}px "Mountains of Christmas", "Baloo 2", serif`;
  ctx.font = askFont();
  while (ctx.measureText(ask).width > W - 2.4 * DPI && askSize > 40) { askSize -= 4; ctx.font = askFont(); }
  ctx.fillText(ask, W / 2, 2.75 * DPI);

  // Coloring pictures grid, inside the border.
  const top = 3.0 * DPI;
  const bottom = H - 2.35 * DPI;
  const gx = 1.25 * DPI; const gw = W - 2 * gx;
  const n = Math.max(1, toys.length);
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 0.2 * DPI;
  const cell = Math.min((gw - gap * (cols - 1)) / cols, (bottom - top - gap * (rows - 1)) / rows);
  const usedW = cols * cell + (cols - 1) * gap;
  const startX = (W - usedW) / 2;
  const usedH = rows * cell + (rows - 1) * gap;
  const startY = top + (bottom - top - usedH) / 2;
  const imgs = await Promise.all(toys.map((t) => loadImage(t.coloring)));
  imgs.forEach((img, i) => {
    const r = Math.floor(i / cols); const col = i % cols;
    // Centre a short last row.
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rowStart = startX + ((cols - inRow) * (cell + gap)) / 2;
    drawContained(ctx, img, rowStart + col * (cell + gap), startY + r * (cell + gap), cell, cell);
  });

  // Love, NAME — big, so kids spot their own name.
  const signY = H - 1.45 * DPI;
  ctx.font = '700 110px "Mountains of Christmas", "Baloo 2", serif';
  const loveW = ctx.measureText('Love, ').width;
  ctx.font = '800 190px "Baloo 2", sans-serif';
  const maxName = W - 2.6 * DPI - loveW;
  const nameW = Math.min(ctx.measureText(name).width, maxName);
  const startSign = (W - (loveW + nameW)) / 2;
  ctx.fillStyle = '#222';
  ctx.textAlign = 'left';
  ctx.font = '700 110px "Mountains of Christmas", "Baloo 2", serif';
  ctx.fillText('Love,', startSign, signY);
  traceText(ctx, name, startSign + loveW, signY + 6, 190, maxName);

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
