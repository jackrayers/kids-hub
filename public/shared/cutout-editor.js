// Cutout editor. Works from the ORIGINAL painted picture (white background), so nothing the
// automatic removal took is ever lost:
//   • "Background removal" slider re-runs the automatic cut gentler or stronger
//   • Tap ✂️ Remove / 🩹 Keep: flood-fill a patch out or back in
//   • 🖌️ Paint back / 🧽 Erase: brush, for edges the automatic cut got wrong (e.g. a glass dome)
//   • "Remove white holes" clears enclosed near-white areas
// Works on iPad (touch) and desktop (mouse).
//
//   const blob = await openCutoutEditor({ source: toy.image, title });   // null if cancelled
import { autoCutout, finishCutout, loadForCutout } from './cutout.js';

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

.ce-stage.brush canvas { cursor: none; }
.ce-ring { position: absolute; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.5); border-radius: 50%; pointer-events: none; transform: translate(-50%, -50%); display: none; }
.ce-row2 { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
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

export async function openCutoutEditor({ source, title = 'Touch up the cutout', strength = 34 } = {}) {
  if (!document.getElementById('ce-css')) {
    document.head.append(Object.assign(document.createElement('style'), { id: 'ce-css', textContent: CSS }));
  }
  const { w, h, orig } = await loadForCutout(source);
  const n = w * h;
  let cur = autoCutout(orig, w, h, { tolerance: strength, soft: strength * 2.1 }).rgba;
  const undo = [];

  const dlg = document.createElement('dialog');
  dlg.className = 'ce-dialog';
  dlg.innerHTML = `
    <div class="ce-wrap">
      <div class="ce-head"><h3></h3><button class="btn small" data-x="cancel">Cancel</button><button class="btn small primary" data-x="save">Save</button></div>
      <div class="ce-stage"><canvas></canvas><div class="ce-ring"></div></div>
      <p class="ce-hint">Too much cut off? Slide <strong>Background removal</strong> gentler, or use <strong>🖌️ Paint back</strong>. White patches left inside? Tap them with <strong>✂️ Remove</strong>.</p>
      <div class="ce-row2">
        <label>Background removal <input type="range" min="6" max="90" value="${strength}" data-x="strength"> <span data-x="strength-label"></span></label>
      </div>
      <div class="ce-bar">
        <span class="ce-seg">
          <button data-mode="remove" aria-pressed="true" title="Tap a patch to make it see-through">✂️ Remove</button>
          <button data-mode="keep" aria-pressed="false" title="Tap a patch to bring it back">🩹 Keep</button>
          <button data-mode="paint" aria-pressed="false" title="Paint parts of the picture back">🖌️ Paint back</button>
          <button data-mode="erase" aria-pressed="false" title="Rub parts out">🧽 Erase</button>
        </span>
        <label data-x="reach-wrap">Reach <input type="range" min="6" max="70" value="24" data-x="tol"></label>
        <label data-x="brush-wrap" hidden>Brush <input type="range" min="4" max="80" value="22" data-x="brush"></label>
      </div>
      <div class="ce-bar">
        <button class="btn small" data-x="holes" title="Remove every near-white area that's enclosed by the toy">Remove white holes</button>
        <button class="btn small" data-x="undo" disabled>Undo</button>
        <button class="btn small" data-x="reset">Start over</button>
        <label title="Paint-style filter, for product photos"><input type="checkbox" data-x="storybook"> 🎨 Storybook look</label>
        <span class="ce-bg" title="Check it against a background">
          <button data-bg="checker" style="background:repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/8px 8px"></button>
          <button data-bg="#f3e2c4" style="background:#f3e2c4"></button>
          <button data-bg="#2b2140" style="background:#2b2140"></button>
        </span>
      </div>
    </div>`;
  dlg.querySelector('h3').textContent = title;
  document.body.append(dlg);
  const q = (sel) => dlg.querySelector(sel);
  const stage = q('.ce-stage'); const view = q('canvas'); const ring = q('.ce-ring');
  view.width = w; view.height = h;
  const vctx = view.getContext('2d');
  const side = Math.min(560, window.innerWidth - 48, window.innerHeight - 330);
  stage.style.width = `${Math.round(side * Math.min(1, w / h))}px`;
  stage.style.height = `${Math.round(side * Math.min(1, h / w))}px`;

  const strengthWord = (v) => (v < 18 ? 'very gentle' : v < 30 ? 'gentle' : v < 45 ? 'normal' : v < 65 ? 'strong' : 'very strong');
  const paintLabel = () => { q('[data-x="strength-label"]').textContent = strengthWord(Number(q('[data-x="strength"]').value)); };
  paintLabel();

  let mode = 'remove';
  let raf = 0;
  const draw = () => {
    raf = 0;
    vctx.putImageData(new ImageData(cur, w, h), 0, 0);
    q('[data-x="undo"]').disabled = !undo.length;
  };
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const snapshot = () => { undo.push(new Uint8ClampedArray(cur)); if (undo.length > 12) undo.shift(); };
  const alphaOf = (p) => cur[p * 4 + 3];
  const restore = (p) => { const i = p * 4; cur[i] = orig[i]; cur[i + 1] = orig[i + 1]; cur[i + 2] = orig[i + 2]; cur[i + 3] = 255; };

  function tapAt(x, y) {
    const tol = Number(q('[data-x="tol"]').value);
    if (mode === 'remove') {
      const mark = flood(orig, w, h, x, y, tol, (p) => alphaOf(p) > 0);
      let k = 0; for (let p = 0; p < n; p++) if (mark[p]) k++;
      if (!k) return;
      snapshot();
      const alpha = new Uint8Array(n);
      for (let p = 0; p < n; p++) alpha[p] = mark[p] ? 0 : alphaOf(p);
      feather(orig, alpha, w, h, mark, tol);
      for (let p = 0; p < n; p++) cur[p * 4 + 3] = alpha[p];
    } else {
      // Bring back the patch under the finger, as it was in the picture.
      const mark = flood(orig, w, h, x, y, tol, (p) => alphaOf(p) < 255);
      let k = 0; for (let p = 0; p < n; p++) if (mark[p]) k++;
      if (!k) return;
      snapshot();
      for (let p = 0; p < n; p++) if (mark[p]) restore(p);
    }
    redraw();
  }

  function brushAt(x, y) {
    const r = Number(q('[data-x="brush"]').value) * (w / view.getBoundingClientRect().width);
    const r2 = r * r;
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(h - 1, Math.ceil(y + r)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(w - 1, Math.ceil(x + r)); xx++) {
        const d2 = (xx - x) ** 2 + (yy - y) ** 2;
        if (d2 > r2) continue;
        const p = yy * w + xx;
        // Soft brush edge.
        const k = Math.min(1, (1 - Math.sqrt(d2) / r) * 3);
        if (mode === 'paint') {
          const i = p * 4;
          const a = Math.max(cur[i + 3], Math.round(255 * k));
          if (a > cur[i + 3]) { cur[i] = orig[i]; cur[i + 1] = orig[i + 1]; cur[i + 2] = orig[i + 2]; cur[i + 3] = a; }
        } else {
          cur[p * 4 + 3] = Math.min(cur[p * 4 + 3], Math.round(255 * (1 - k)));
        }
      }
    }
    redraw();
  }

  function removeHoles() {
    const tol = Number(q('[data-x="tol"]').value);
    const white = (p) => alphaOf(p) > 0 && orig[p * 4] > 255 - tol * 2 && orig[p * 4 + 1] > 255 - tol * 2 && orig[p * 4 + 2] > 255 - tol * 2;
    const seen = new Uint8Array(n);
    const alpha = new Uint8Array(n);
    for (let p = 0; p < n; p++) alpha[p] = alphaOf(p);
    const minArea = Math.max(40, Math.round(n * 0.003)); // skip small highlights (eyes, shine) — tap those by hand
    let removed = 0;
    for (let p0 = 0; p0 < n; p0++) {
      if (seen[p0] || !white(p0)) continue;
      const region = []; const stack = [p0]; seen[p0] = 1;
      while (stack.length) {
        const p = stack.pop(); region.push(p); const x = p % w;
        for (const nb of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
          if (nb >= 0 && nb < n && !seen[nb] && white(nb)) { seen[nb] = 1; stack.push(nb); }
        }
      }
      if (region.length < minArea) continue;
      const mark = new Uint8Array(n);
      for (const p of region) { mark[p] = 1; alpha[p] = 0; }
      feather(orig, alpha, w, h, mark, tol);
      removed++;
    }
    if (removed) {
      snapshot();
      for (let p = 0; p < n; p++) cur[p * 4 + 3] = alpha[p];
      redraw();
    }
    return removed;
  }

  const point = (e) => {
    const r = view.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h];
  };
  let painting = false;
  const brushy = () => mode === 'paint' || mode === 'erase';
  const showRing = (e) => {
    if (!brushy()) { ring.style.display = 'none'; return; }
    const r = stage.getBoundingClientRect();
    const size = Number(q('[data-x="brush"]').value) * 2;
    Object.assign(ring.style, { display: 'block', left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px`, width: `${size}px`, height: `${size}px` });
  };
  view.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const [x, y] = point(e);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (brushy()) { snapshot(); painting = true; view.setPointerCapture(e.pointerId); brushAt(x, y); showRing(e); } else tapAt(Math.floor(x), Math.floor(y));
  });
  view.addEventListener('pointermove', (e) => { showRing(e); if (painting) { const [x, y] = point(e); brushAt(x, y); } });
  const stop = () => { painting = false; };
  view.addEventListener('pointerup', stop);
  view.addEventListener('pointercancel', stop);
  view.addEventListener('pointerleave', () => { ring.style.display = 'none'; });

  dlg.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    dlg.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    q('[data-x="reach-wrap"]').hidden = brushy();
    q('[data-x="brush-wrap"]').hidden = !brushy();
    stage.classList.toggle('brush', brushy());
  }));
  dlg.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => {
    stage.style.background = b.dataset.bg === 'checker' ? '' : b.dataset.bg;
  }));
  const strengthInput = q('[data-x="strength"]');
  strengthInput.addEventListener('input', paintLabel);
  strengthInput.addEventListener('change', () => {
    snapshot();
    const t = Number(strengthInput.value);
    cur = autoCutout(orig, w, h, { tolerance: t, soft: Math.max(t + 10, t * 2.1) }).rgba;
    redraw();
  });
  q('[data-x="holes"]').addEventListener('click', (e) => {
    const k = removeHoles();
    e.target.textContent = k ? `Removed ${k} hole${k === 1 ? '' : 's'}` : 'No white holes found';
    setTimeout(() => { e.target.textContent = 'Remove white holes'; }, 1800);
  });
  q('[data-x="undo"]').addEventListener('click', () => { if (undo.length) { cur = undo.pop(); redraw(); } });
  q('[data-x="reset"]').addEventListener('click', () => {
    snapshot();
    strengthInput.value = String(strength); paintLabel();
    cur = autoCutout(orig, w, h, { tolerance: strength, soft: strength * 2.1 }).rgba;
    redraw();
  });

  draw();
  dlg.showModal();
  return new Promise((resolve) => {
    const finish = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    q('[data-x="cancel"]').addEventListener('click', () => finish(null));
    q('[data-x="save"]').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Saving…';
      let { blob } = await finishCutout(cur, w, h);
      if (q('[data-x="storybook"]').checked) {
        const { makeStorybook } = await import('./storybook.js');
        const url = URL.createObjectURL(blob);
        try { blob = await makeStorybook(url); } finally { URL.revokeObjectURL(url); }
      }
      finish(blob);
    });
  });
}
