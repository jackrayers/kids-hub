// Reads a PrusaSlicer project .3mf in the browser (parent mode) and turns it into
// a light, color-slotted preview mesh for the kids' tablets.
//
// Colors: every triangle prints with an extruder (1–5). Unpainted triangles use the
// volume's or object's extruder (default 1). Painted triangles carry
// slic3rpe:mmu_segmentation — PrusaSlicer's TriangleSelector bitstream: hex chars read
// from the END, each nibble LSB-first; a node's first nibble has the split-side count in
// its low 2 bits (0 = leaf) and the state (leaf; 3 means "next nibble + 3") or special
// side (split) in its high 2 bits; split nodes have sides+1 children. State 0 = default
// extruder, N = extruder N. Split triangles take the state covering most of their area.
import { unzipSync, strFromU8 } from '/vendor/fflate-0.8.3.js';
import { MeshoptSimplifier } from '/vendor/meshopt_simplifier-1.3.0.js';

const idle = () => new Promise((r) => setTimeout(r, 0));

export function decodeSegmentation(hex) {
  const bits = new Uint8Array(hex.length * 4);
  let n = 0;
  for (let i = hex.length - 1; i >= 0; i--) {
    const v = parseInt(hex[i], 16);
    for (let b = 0; b < 4; b++) bits[n++] = (v >> b) & 1;
  }
  let p = 0;
  const nib = () => { let v = 0; for (let b = 0; b < 4; b++) v |= bits[p++] << b; return v; };
  const weight = new Map();
  (function node(depth) {
    const code = nib(); const sides = code & 3; const hi = code >> 2;
    if (!sides) {
      const st = hi === 3 ? nib() + 3 : hi;
      weight.set(st, (weight.get(st) || 0) + 4 ** -depth);
    } else {
      for (let k = 0; k <= sides; k++) node(depth + 1);
    }
  })(0);
  let best = 0; let bestW = -1;
  for (const [st, w] of weight) if (w > bestW) { best = st; bestW = w; }
  return best;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Parses the project. Returns { title, positions: Float32Array (mm, Z up), triangles: Uint32Array, extruders: Uint8Array, colours[] }. */
export async function parseProject(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const modelName = Object.keys(files).find((k) => /^3D\/.*\.model$/i.test(k));
  if (!modelName) throw new Error('This doesn’t look like a 3MF file');
  const xml = strFromU8(files[modelName]);
  const cfgFile = files['Metadata/Slic3r_PE.config'];
  if (!cfgFile) throw new Error('Save it from PrusaSlicer as a project (File → Save Project As)');
  const cfg = strFromU8(cfgFile);
  const modelCfg = files['Metadata/Slic3r_PE_model.config'] ? strFromU8(files['Metadata/Slic3r_PE_model.config']) : '';
  await idle();

  const cfgList = (key) => (cfg.match(new RegExp(`^; ${key} = (.*)$`, 'm'))?.[1] || '').split(';');
  const extruderColour = cfgList('extruder_colour');
  const filamentColour = cfgList('filament_colour');
  const colours = [0, 1, 2, 3, 4].map((i) => (/^#[0-9a-f]{6}$/i.test(extruderColour[i] || '') ? extruderColour[i]
    : /^#[0-9a-f]{6}$/i.test(filamentColour[i] || '') ? filamentColour[i] : '#C8C8C8').toUpperCase());

  // Per-object settings from PrusaSlicer: default extruder and volumes (triangle ranges).
  const objectInfo = {};
  for (const om of modelCfg.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const body = om[2];
    const objExtruder = +(body.match(/<metadata type="object" key="extruder" value="(\d+)"/)?.[1] || 0);
    const volumes = [...body.matchAll(/<volume firstid="(\d+)" lastid="(\d+)">([\s\S]*?)<\/volume>/g)].map((v) => ({
      first: +v[1], last: +v[2],
      extruder: +(v[3].match(/key="extruder" value="(\d+)"/)?.[1] || 0),
      type: v[3].match(/key="volume_type" value="([^"]+)"/)?.[1] || 'ModelPart',
    }));
    objectInfo[om[1]] = { extruder: objExtruder, volumes };
  }

  // Meshes per object.
  const objects = {};
  for (const om of xml.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const body = om[2];
    if (!body.includes('<mesh>')) continue;
    const verts = [];
    for (const v of body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) verts.push(+v[1], +v[2], +v[3]);
    const tris = []; const ext = [];
    const info = objectInfo[om[1]] || { extruder: 0, volumes: [] };
    let t = 0;
    const segCache = new Map(); // most painted triangles share a handful of codes
    for (const tm of body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"([^>]*?)\/>/g)) {
      const vol = info.volumes.find((v) => t >= v.first && t <= v.last);
      t++;
      if (vol && vol.type !== 'ModelPart') continue; // modifiers, negative volumes, blockers aren't printed
      const rest = tm[4];
      let state = 0;
      const at = rest.indexOf('mmu_segmentation="');
      if (at >= 0) {
        const seg = rest.slice(at + 18, rest.indexOf('"', at + 18));
        state = segCache.get(seg);
        if (state === undefined) { state = seg ? decodeSegmentation(seg) : 0; segCache.set(seg, state); }
      }
      const base = (vol?.extruder || info.extruder || 1);
      tris.push(+tm[1], +tm[2], +tm[3]);
      ext.push(Math.min(5, Math.max(1, state > 0 ? state : base)));
    }
    objects[om[1]] = { verts, tris, ext };
    await idle();
  }

  // Place each build item (instance) with its transform.
  const P = []; const T = []; const E = [];
  const items = [...xml.matchAll(/<item ([^>]*?)\/?>/g)].map((m) => ({ id: attr(m[1], 'objectid'), tf: attr(m[1], 'transform') }));
  if (!items.length) Object.keys(objects).forEach((id) => items.push({ id, tf: null }));
  for (const it of items) {
    const o = objects[it.id];
    if (!o) continue;
    const m = it.tf ? it.tf.trim().split(/\s+/).map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    const base = P.length / 3;
    for (let i = 0; i < o.verts.length; i += 3) {
      const x = o.verts[i]; const y = o.verts[i + 1]; const z = o.verts[i + 2];
      P.push(x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]);
    }
    for (let i = 0; i < o.tris.length; i++) T.push(o.tris[i] + base);
    for (let i = 0; i < o.ext.length; i++) E.push(o.ext[i]);
  }
  if (!T.length) throw new Error('No printable parts found in this project');
  const title = (xml.match(/<metadata name="Title">([^<]*)<\/metadata>/)?.[1] || '').trim();
  return { title, positions: new Float32Array(P), triangles: new Uint32Array(T), extruders: new Uint8Array(E), colours };
}

/** Slots used by the model with their share of surface area, largest first. */
export function slotsFrom({ positions: P, triangles: T, extruders: E, colours }) {
  const area = new Map();
  let total = 0;
  for (let i = 0; i < E.length; i++) {
    const a = T[3 * i] * 3; const b = T[3 * i + 1] * 3; const c = T[3 * i + 2] * 3;
    const ux = P[b] - P[a]; const uy = P[b + 1] - P[a + 1]; const uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a]; const vy = P[c + 1] - P[a + 1]; const vz = P[c + 2] - P[a + 2];
    const s = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    area.set(E[i], (area.get(E[i]) || 0) + s);
    total += s;
  }
  return [...area.entries()].sort((x, y) => y[1] - x[1]).map(([extruder, a], i) => ({
    extruder,
    name: i === 0 ? 'Main' : `Color ${i + 1}`,
    hex: colours[extruder - 1],
    share: Math.round((a / total) * 1000) / 1000,
  }));
}

export function sizeOf({ positions: P }) {
  const mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) { const k = i % 3; if (P[i] < mn[k]) mn[k] = P[i]; if (P[i] > mx[k]) mx[k] = P[i]; }
  return mx.map((v, k) => Math.round((v - mn[k]) * 10) / 10);
}

/**
 * Simplifies each color region separately (borders locked, so regions still meet) and packs
 * the result into the compact KHM1 preview format the kids' viewer reads.
 */
export async function buildPreview({ positions: P, triangles: T, extruders: E }, { targetTriangles = 40000 } = {}) {
  await MeshoptSimplifier.ready;
  const total = E.length;
  const groupsIn = new Map();
  for (let i = 0; i < total; i++) {
    let g = groupsIn.get(E[i]);
    if (!g) { g = []; groupsIn.set(E[i], g); }
    g.push(T[3 * i], T[3 * i + 1], T[3 * i + 2]);
  }
  const ratio = Math.min(1, targetTriangles / total);
  const remap = new Map(); const outPos = []; const outIdx = []; const groups = [];
  for (const extruder of [...groupsIn.keys()].sort((a, b) => a - b)) {
    const idx = new Uint32Array(groupsIn.get(extruder));
    let simp = idx;
    if (ratio < 1) {
      const want = Math.max(36, Math.floor((idx.length / 3) * ratio) * 3);
      [simp] = MeshoptSimplifier.simplify(idx, P, 3, want, 0.01, ['LockBorder']);
    }
    const start = outIdx.length;
    for (const v of simp) {
      let n = remap.get(v);
      if (n === undefined) { n = remap.size; remap.set(v, n); outPos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
      outIdx.push(n);
    }
    groups.push({ extruder, start, count: outIdx.length - start });
    await idle();
  }
  const nv = outPos.length / 3;
  const mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < outPos.length; i++) { const k = i % 3; mn[k] = Math.min(mn[k], outPos[i]); mx[k] = Math.max(mx[k], outPos[i]); }
  const q = new Int16Array(outPos.length);
  for (let i = 0; i < outPos.length; i++) {
    const k = i % 3; const span = mx[k] - mn[k] || 1;
    q[i] = Math.round(((outPos[i] - mn[k]) / span) * 65535 - 32768);
  }
  const index32 = nv > 65535;
  const ind = index32 ? new Uint32Array(outIdx) : new Uint16Array(outIdx);
  const header = new TextEncoder().encode(JSON.stringify({ v: 1, nv, ni: outIdx.length, index32, min: mn, max: mx, groups }));
  const pad4 = (n) => (n + 3) & ~3;
  const hLen = pad4(header.length);
  const posOff = 8 + hLen;
  const idxOff = pad4(posOff + q.byteLength);
  const out = new Uint8Array(idxOff + ind.byteLength);
  out.set([75, 72, 77, 49], 0); // "KHM1"
  new DataView(out.buffer).setUint32(4, header.length, true);
  out.set(header, 8);
  out.set(new Uint8Array(q.buffer), posOff);
  out.set(new Uint8Array(ind.buffer), idxOff);
  return { bytes: out, triangles: outIdx.length / 3 };
}
