// Touch-up tool for cutouts: tap a white (or any) patch inside the toy to make it see-through,
// or switch to "Keep" and tap to bring a patch back. "Remove white holes" finds every
// enclosed near-white area at once. Works on iPad (touch) and desktop (mouse).
//
//   const blob = await openCutoutEditor('/img/…cutout.webp', { title });   // null if cancelled

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load the cutout'));
    img.src = src;
  });
}

const CSS = `
.ce-dialog { border: 0; border-radius: 18px; padding: 0; width: min(720px, calc(100vw - 20px)); max-height: calc(100vh - 20px); box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.ce-dialog::backdrop { background: rgba(30, 20, 40, .45); }
.ce-wrap { display: grid; gap: 10px; padding: 14px; }
.ce-head { display: flex; align-items: center; gap: 10px; }
.ce-head h3 { margin: 0; flex: 1; font-size: 1.05rem; }
.ce-stage { position: relative; border-radius: 12px; overflow: hidden; touch-action: none; justify-self: center;
  background: repeating-conic-gradient(#e9e4ee 0% 25%, #fff 0% 50%) 0 0 / 18px 18px; }
.ce-stage canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
.ce-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ce-seg { display: inline-flex; border: 1px solid rgba(0,0,0,.15); border-radius: 10px; overflow: hidden; }
.ce-seg button { border: 0; background: #fff; padding: 7px 12px; font: inherit; font-size: .9rem; }
.ce-seg button[aria-pressed="true"] { background: #2b2140; color: #fff; }
.ce-bar label { display: inline-flex; align-items: center; gap: 6px; font-size: .85rem; color: #6b6178; }
.ce-hint { margin: 0; font-size: .85rem; color: #6b6178; }
.ce-bg { display: inline-flex; gap: 4px; }
.ce-bg button { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.2); padding: 0; }
`;

/** Flood fill from (x, y) over pixels whose colour is within `tol` of the seed (and that pass `allow`). */
function flood(rgb, w, h, x0, y0, tol, allow) {
  const n = w * h; const mark = new Uint8Array(n);
  const seed = y0 * w + x0;
  if (!allow(seed)) return mark;
  const sr = rgb[seed * 4]; const sg = rgb[seed * 4 + 1]; const sb = rgb[seed * 4 + 2];
  const near = (p) => {
    const i = p * 4;
    return Math.abs(rgb[i] - sr) + Math.abs(rgb[i + 1] - sg) + Math.abs(rgb[i + 2] - sb) <= tol * 3;
  };
  const stack = [seed]; mark[seed] = 1;
  while (stack.length) {
    const p = stack.pop(); const x = p % w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
    for (const q of nb) if (q >= 0 && q < n && !mark[q] && allow(q) && near(q)) { mark[q] = 1; stack.push(q); }
  }
  return mark;
}

/** Soft edge: pixels touching a removed area fade according to how close they are to the removed colour. */
function feather(orig, alpha, w, h, mark, tol) {
  const n = w * h;
  let r = 0; let g = 0; let b = 0; let k = 0;
  for (let p = 0; p < n; p++) if (mark[p]) { r += orig[p * 4]; g += orig[p * 4 + 1]; b += orig[p * 4 + 2]; k++; }
  if (!k) return;
  r /= k; g /= k; b /= k;
  for (let p = 0; p < n; p++) {
    if (mark[p] || !alpha[p]) continue;
    const x = p % w;
    const touches = (x > 0 && mark[p - 1]) || (x < w - 1 && mark[p + 1]) || (p >= w && mark[p - w]) || (p + w < n && mark[p + w]);
    if (!touches) continue;
    const d = (Math.abs(orig[p * 4] - r) + Math.abs(orig[p * 4 + 1] - g) + Math.abs(orig[p * 4 + 2] - b)) / 3;
    const keep = Math.max(0, Math.min(1, (d - tol * 0.5) / (tol * 1.5)));
    alpha[p] = Math.min(alpha[p], Math.round(255 * keep));
  }
}

export async function openCutoutEditor(src, { title = 'Touch up the cutout' } = {}) {
  if (!document.getElementById('ce-css')) {
    document.head.append(Object.assign(document.createElement('style'), { id: 'ce-css', textContent: CSS }));
  }
  const img = await loadImage(src);
  const w = img.naturalWidth; const h = img.naturalHeight;
  const work = document.createElement('canvas'); work.width = w; work.height = h;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(img, 0, 0);
  const base = wctx.getImageData(0, 0, w, h);
  const orig = new Uint8ClampedArray(base.data); // colours + alpha as loaded
  const n = w * h;
  const origAlpha = new Uint8Array(n);
  for (let p = 0; p < n; p++) origAlpha[p] = orig[p * 4 + 3];
  let alpha = origAlpha.slice();
  const undo = [];

  const dlg = document.createElement('dialog');
  dlg.className = 'ce-dialog';
  dlg.innerHTML = `
    <div class="ce-wrap">
      <div class="ce-head"><h3></h3><button class="btn small" data-x="cancel">Cancel</button><button class="btn small primary" data-x="save">Save</button></div>
      <div class="ce-stage"><canvas></canvas></div>
      <p class="ce-hint">Tap a white patch inside the toy to make it see-through. Switch to <strong>Keep</strong> and tap to bring a part back.</p>
      <div class="ce-bar">
        <span class="ce-seg"><button data-mode="remove" aria-pressed="true">✂️ Remove</button><button data-mode="keep" aria-pressed="false">🩹 Keep</button></span>
        <label>Reach <input type="range" min="6" max="70" value="24" data-x="tol"></label>
        <button class="btn small" data-x="holes" title="Remove every near-white area that's enclosed by the toy">Remove white holes</button>
        <button class="btn small" data-x="undo" disabled>Undo</button>
        <button class="btn small" data-x="reset">Start over</button>
        <span class="ce-bg" title="Check it against a background">
          <button data-bg="checker" style="background:repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/8px 8px"></button>
          <button data-bg="#f3e2c4" style="background:#f3e2c4"></button>
          <button data-bg="#2b2140" style="background:#2b2140"></button>
        </span>
      </div>
    </div>`;
  dlg.querySelector('h3').textContent = title;
  document.body.append(dlg);
  const stage = dlg.querySelector('.ce-stage');
  const view = dlg.querySelector('canvas');
  view.width = w; view.height = h;
  const vctx = view.getContext('2d');
  const side = Math.min(560, window.innerWidth - 48, window.innerHeight - 260);
  stage.style.width = `${Math.round(side * Math.min(1, w / h))}px`;
  stage.style.height = `${Math.round(side * Math.min(1, h / w))}px`;

  let mode = 'remove';
  const tolInput = dlg.querySelector('[data-x="tol"]');
  const out = vctx.createImageData(w, h);
  const draw = () => {
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      out.data[i] = orig[i]; out.data[i + 1] = orig[i + 1]; out.data[i + 2] = orig[i + 2]; out.data[i + 3] = alpha[p];
    }
    vctx.putImageData(out, 0, 0);
    dlg.querySelector('[data-x="undo"]').disabled = !undo.length;
  };
  const commit = (next) => { undo.push(alpha); if (undo.length > 30) undo.shift(); alpha = next; draw(); };

  function tapAt(x, y) {
    const tol = Number(tolInput.value);
    const next = alpha.slice();
    if (mode === 'remove') {
      const mark = flood(orig, w, h, x, y, tol, (p) => next[p] > 0);
      let k = 0;
      for (let p = 0; p < n; p++) if (mark[p]) { next[p] = 0; k++; }
      if (!k) return;
      feather(orig, next, w, h, mark, tol);
    } else {
      // Bring back the patch under the finger, as it was originally.
      const mark = flood(orig, w, h, x, y, tol, (p) => origAlpha[p] > 0 && next[p] < origAlpha[p]);
      let k = 0;
      for (let p = 0; p < n; p++) if (mark[p]) { next[p] = origAlpha[p]; k++; }
      if (!k) return;
    }
    commit(next);
  }

  function removeHoles() {
    // Near-white, still-opaque pixels that are not connected to the outside through transparency.
    const tol = Number(tolInput.value);
    const white = (p) => alpha[p] > 0 && orig[p * 4] > 255 - tol * 2 && orig[p * 4 + 1] > 255 - tol * 2 && orig[p * 4 + 2] > 255 - tol * 2;
    const seen = new Uint8Array(n);
    const next = alpha.slice();
    const minArea = Math.max(40, Math.round(n * 0.003)); // skip small highlights (eyes, shine) — tap those by hand
    let removed = 0;
    for (let p0 = 0; p0 < n; p0++) {
      if (seen[p0] || !white(p0)) continue;
      const region = []; const stack = [p0]; seen[p0] = 1;
      while (stack.length) {
        const p = stack.pop(); region.push(p); const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
          if (q >= 0 && q < n && !seen[q] && white(q)) { seen[q] = 1; stack.push(q); }
        }
      }
      if (region.length < minArea) continue;
      const mark = new Uint8Array(n);
      for (const p of region) { mark[p] = 1; next[p] = 0; }
      feather(orig, next, w, h, mark, tol);
      removed++;
    }
    if (removed) commit(next);
    return removed;
  }

  const point = (e) => {
    const r = view.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * w), Math.floor(((e.clientY - r.top) / r.height) * h)];
  };
  view.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const [x, y] = point(e);
    if (x >= 0 && y >= 0 && x < w && y < h) tapAt(x, y);
  });

  dlg.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    dlg.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  dlg.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => {
    stage.style.background = b.dataset.bg === 'checker' ? '' : b.dataset.bg;
  }));
  dlg.querySelector('[data-x="holes"]').addEventListener('click', (e) => {
    const k = removeHoles();
    e.target.textContent = k ? `Removed ${k} hole${k === 1 ? '' : 's'}` : 'No white holes found';
    setTimeout(() => { e.target.textContent = 'Remove white holes'; }, 1800);
  });
  dlg.querySelector('[data-x="undo"]').addEventListener('click', () => { if (undo.length) { alpha = undo.pop(); draw(); } });
  dlg.querySelector('[data-x="reset"]').addEventListener('click', () => commit(origAlpha.slice()));

  draw();
  dlg.showModal();
  return new Promise((resolve) => {
    const finish = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.querySelector('[data-x="cancel"]').addEventListener('click', () => finish(null));
    dlg.querySelector('[data-x="save"]').addEventListener('click', () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').putImageData(out, 0, 0);
      c.toBlob((b) => {
        if (b && b.type === 'image/webp') finish(b);
        else c.toBlob((p) => finish(p), 'image/png');
      }, 'image/webp', 0.92);
    });
  });
}
