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

/**
 * Parses a project: PrusaSlicer (.3mf saved as a project) or Bambu Studio / MakerWorld.
 * Returns { title, positions (mm, Z up, as displayed), triangles, extruders (filament no. per
 * triangle), colours[] (hex per filament), printZ (Z per vertex as it sits on the print bed),
 * plates (plate no. per triangle), meta { source, plateCount, slice[], designer, license, refImage } }.
 */
export async function parseProject(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  if (files['Metadata/project_settings.config'] || Object.keys(files).some((k) => /^3D\/Objects\//.test(k))) return parseBambu(files);
  return parsePrusa(files);
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const matrix = (tf) => (tf ? tf.trim().split(/\s+/).map(Number) : IDENTITY);
// 3MF 3×4 transforms (row vectors): p' = p·M. compose(a, b) = apply a, then b.
function compose(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let j = 0; j < 3; j++) r[9 + j] = a[9] * b[j] + a[10] * b[3 + j] + a[11] * b[6 + j] + b[9 + j];
  return r;
}

/** Meshes in one model file: { [objectId]: { verts: Float64Array, tris: Uint32Array, paint: Uint8Array (0 = unpainted) } } */
function readMeshes(xml, segCache) {
  const out = {};
  for (const om of xml.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const body = om[2];
    if (!body.includes('<mesh>')) continue;
    const verts = [];
    for (const v of body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) verts.push(+v[1], +v[2], +v[3]);
    const tris = []; const paint = [];
    for (const tm of body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"([^>]*?)\/>/g)) {
      tris.push(+tm[1], +tm[2], +tm[3]);
      const rest = tm[4];
      let state = 0;
      const at = rest.indexOf('paint_color="');
      const at2 = at < 0 ? rest.indexOf('mmu_segmentation="') : -1;
      const start = at >= 0 ? at + 13 : at2 >= 0 ? at2 + 18 : -1;
      if (start >= 0) {
        const seg = rest.slice(start, rest.indexOf('"', start));
        state = segCache.get(seg);
        if (state === undefined) { state = seg ? decodeSegmentation(seg) : 0; segCache.set(seg, state); }
      }
      paint.push(state);
    }
    out[om[1]] = { verts: Float64Array.from(verts), tris: Uint32Array.from(tris), paint: Uint8Array.from(paint) };
  }
  return out;
}

// Multi-plate kits: if the designer's assembled view looks sensible keep it; otherwise (or with no
// assembled view) lay the pieces out side by side, standing on the floor, so the preview isn't a
// handful of specks spread across several virtual print beds.
function layOutKit(P, ranges, hadAssembly) {
  const ids = Object.keys(ranges);
  if (ids.length < 2) return;
  const box = (a, b) => {
    const mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
    for (let v = a; v < b; v++) for (let k = 0; k < 3; k++) { const x = P[3 * v + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    return { mn, mx };
  };
  const boxes = ids.map((id) => ({ id, ...box(...ranges[id]) }));
  const all = { mn: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.mn[k]))), mx: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.mx[k]))) };
  const span = (b) => Math.max(...[0, 1, 2].map((k) => b.mx[k] - b.mn[k]));
  const biggest = Math.max(...boxes.map(span));
  if (hadAssembly && span(all) <= biggest * 1.6) return;
  boxes.sort((a, b) => span(b) - span(a));
  let x = 0;
  for (const b of boxes) {
    const dx = x - b.mn[0]; const dy = -(b.mn[1] + b.mx[1]) / 2; const dz = -b.mn[2];
    const [first, end] = ranges[b.id];
    for (let v = first; v < end; v++) { P[3 * v] += dx; P[3 * v + 1] += dy; P[3 * v + 2] += dz; }
    x += b.mx[0] - b.mn[0] + biggest * 0.08;
  }
}

async function parseBambu(files) {
  const mainName = Object.keys(files).find((k) => /^3D\/3dmodel\.model$/i.test(k)) || Object.keys(files).find((k) => /^3D\/[^/]+\.model$/i.test(k));
  if (!mainName) throw new Error('This doesn’t look like a 3MF file');
  const xml = strFromU8(files[mainName]);
  let proj = {};
  try { proj = JSON.parse(strFromU8(files['Metadata/project_settings.config'] || new Uint8Array())); } catch { /* older files */ }
  const hex = (c) => (/^#[0-9a-f]{6}/i.test(c || '') ? c.slice(0, 7).toUpperCase() : '#C8C8C8');
  const colours = (proj.filament_colour || []).map(hex);
  const modelCfg = files['Metadata/model_settings.config'] ? strFromU8(files['Metadata/model_settings.config']) : '';
  const sliceCfg = files['Metadata/slice_info.config'] ? strFromU8(files['Metadata/slice_info.config']) : '';
  await idle();

  // Object settings: default filament and parts (in the same order as the object's components).
  const objCfg = {};
  for (const om of modelCfg.matchAll(/<object id="(\d+)">([\s\S]*?)<\/object>/g)) {
    const head = om[2].split('<part')[0];
    objCfg[om[1]] = {
      extruder: +(head.match(/key="extruder" value="(\d+)"/)?.[1] || 1),
      parts: [...om[2].matchAll(/<part id="\d+" subtype="([^"]+)">([\s\S]*?)<\/part>/g)].map((p) => ({
        subtype: p[1], extruder: +(p[2].match(/key="extruder" value="(\d+)"/)?.[1] || 0),
      })),
    };
  }
  // Which plate each object is on.
  const plateOf = {};
  let plateCount = 0;
  for (const pm of modelCfg.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const id = +(pm[1].match(/key="plater_id" value="(\d+)"/)?.[1] || ++plateCount);
    plateCount = Math.max(plateCount, id);
    for (const im of pm[1].matchAll(/<model_instance>[\s\S]*?key="object_id" value="(\d+)"[\s\S]*?<\/model_instance>/g)) plateOf[im[1]] ??= id;
  }
  // The "assembled" view designers set up for multi-part kits (else the print layout).
  const assembled = {};
  for (const am of modelCfg.matchAll(/<assemble_item ([^>]*?)\/>/g)) {
    const id = attr(am[1], 'object_id');
    if (attr(am[1], 'instance_id') === '0' || !assembled[id]) assembled[id] = matrix(attr(am[1], 'transform'));
  }

  // Top-level objects and their components (meshes live in 3D/Objects/*.model).
  const segCache = new Map();
  const meshFiles = { [mainName]: null };
  const meshesIn = (path) => {
    const key = path.replace(/^\//, '');
    if (meshFiles[key] === undefined || meshFiles[key] === null) {
      if (!files[key]) return {};
      meshFiles[key] = readMeshes(strFromU8(files[key]), segCache);
    }
    return meshFiles[key];
  };
  const localMeshes = readMeshes(xml, segCache);
  const top = {};
  for (const om of xml.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const comps = [...om[2].matchAll(/<component ([^>]*?)\/>/g)].map((c) => ({
      path: attr(c[1], 'p:path'), objectid: attr(c[1], 'objectid'), tf: matrix(attr(c[1], 'transform')),
    }));
    top[om[1]] = { comps };
  }
  const items = [...xml.matchAll(/<item ([^>]*?)\/>/g)].map((m) => ({ id: attr(m[1], 'objectid'), tf: matrix(attr(m[1], 'transform')), printable: attr(m[1], 'printable') !== '0' }));
  if (!items.length) throw new Error('No printable parts found in this project');

  // Count first so we can allocate once (these files can be half a million triangles).
  const pieces = [];
  for (const it of items) {
    if (!it.printable) continue;
    const cfg = objCfg[it.id] || { extruder: 1, parts: [] };
    const obj = top[it.id];
    const list = obj && obj.comps.length ? obj.comps : [{ path: null, objectid: it.id, tf: IDENTITY }];
    list.forEach((c, idx) => {
      const part = cfg.parts[idx] || {};
      if (part.subtype && part.subtype !== 'normal_part') return; // modifiers, negative volumes, support blockers
      const mesh = (c.path ? meshesIn(c.path) : localMeshes)[c.objectid];
      if (!mesh) return;
      pieces.push({
        item: it.id, mesh, base: part.extruder || cfg.extruder || 1, plate: plateOf[it.id] || 1,
        show: compose(c.tf, assembled[it.id] || it.tf), print: compose(c.tf, it.tf),
      });
    });
  }
  await idle();
  let nv = 0; let nt = 0;
  for (const p of pieces) { nv += p.mesh.verts.length / 3; nt += p.mesh.tris.length / 3; }
  if (!nt) throw new Error('No printable parts found in this project');
  const positions = new Float32Array(nv * 3); const printZ = new Float32Array(nv);
  const triangles = new Uint32Array(nt * 3); const extruders = new Uint8Array(nt); const plates = new Uint8Array(nt);
  let vo = 0; let to = 0;
  const ranges = {}; // item → [first vertex, end vertex)
  for (const p of pieces) {
    (ranges[p.item] ||= [vo / 3, vo / 3])[1] = (vo + p.mesh.verts.length) / 3;
    const { verts, tris, paint } = p.mesh; const m = p.show; const q = p.print;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i]; const y = verts[i + 1]; const z = verts[i + 2];
      const o = vo + i;
      positions[o] = x * m[0] + y * m[3] + z * m[6] + m[9];
      positions[o + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
      positions[o + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
      printZ[o / 3] = x * q[2] + y * q[5] + z * q[8] + q[11];
    }
    const base = vo / 3;
    for (let i = 0; i < tris.length; i++) triangles[to * 3 + i] = tris[i] + base;
    for (let i = 0; i < paint.length; i++) { extruders[to + i] = paint[i] > 0 ? paint[i] : p.base; plates[to + i] = p.plate; }
    vo += verts.length; to += tris.length / 3;
    await idle();
  }

  layOutKit(positions, ranges, Object.keys(assembled).length > 0);

  // What the designer's own slice says, per plate.
  const slice = [...sliceCfg.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((pm) => {
    const b = pm[1];
    const meta = (k) => b.match(new RegExp(`key="${k}" value="([^"]*)"`))?.[1];
    return {
      plate: +(meta('index') || 0), hours: meta('prediction') ? +(+meta('prediction') / 3600).toFixed(1) : null,
      grams: meta('weight') ? +(+meta('weight')).toFixed(0) : null, support: meta('support_used') === 'true',
      filaments: [...b.matchAll(/<filament ([^>]*?)\/>/g)].map((f) => ({ id: +attr(f[1], 'id'), hex: hex(attr(f[1], 'color')), grams: +(+attr(f[1], 'used_g') || 0).toFixed(1) })),
    };
  }).filter((p) => p.plate);

  const md = (name) => (xml.match(new RegExp(`<metadata name="${name}">([^<]*)</metadata>`))?.[1] || '').trim();
  const refName = ['Metadata/plate_1.png', 'Auxiliaries/.thumbnails/thumbnail_middle.png', 'Auxiliaries/.thumbnails/thumbnail_3mf.png'].find((n) => files[n]);
  return {
    title: md('Title'), positions, triangles, extruders, colours, printZ, plates,
    meta: {
      source: 'bambu', plateCount: Math.max(1, plateCount), slice,
      designer: md('Designer') || null, license: md('License') || null,
      refImage: refName ? files[refName] : null,
    },
  };
}

async function parsePrusa(files) {
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
  const positions = new Float32Array(P);
  const printZ = new Float32Array(positions.length / 3);
  for (let i = 0; i < printZ.length; i++) printZ[i] = positions[3 * i + 2];
  return {
    title, positions, triangles: new Uint32Array(T), extruders: new Uint8Array(E), colours,
    printZ, plates: new Uint8Array(E.length).fill(1),
    meta: { source: 'prusaslicer', plateCount: 1, slice: [], designer: null, license: null },
  };
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

/**
 * "Can the MMU3 print this in one go?" — a quick estimate from the model itself.
 * Slices each plate into layers and counts the filaments each layer needs: every extra
 * colour in a layer is a filament swap (slow on the MMU3, and each one purges filament).
 * Returns { colors, plates, swaps, swapHours, purgeGrams, height, support, verdict: 'good'|'ok'|'hard'|'no', notes[] }.
 */
export function printCheck({ triangles: T, extruders: E, printZ: Z, plates: PL, meta = {} }, { layer = 0.2, swapSeconds = 70, purgeGramsPerSwap = 0.15 } = {}) {
  const used = new Set(E);
  const plateIds = [...new Set(PL)].sort((a, b) => a - b);
  let swaps = 0; let height = 0;
  for (const plate of plateIds) {
    let zmin = Infinity; let zmax = -Infinity;
    for (let t = 0; t < E.length; t++) {
      if (PL[t] !== plate) continue;
      for (let k = 0; k < 3; k++) { const z = Z[T[3 * t + k]]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
    }
    if (!Number.isFinite(zmin)) continue;
    height = Math.max(height, zmax - zmin);
    const layers = Math.max(1, Math.ceil((zmax - zmin) / layer));
    const masks = new Uint32Array(layers + 1);
    for (let t = 0; t < E.length; t++) {
      if (PL[t] !== plate) continue;
      const a = Z[T[3 * t]]; const b = Z[T[3 * t + 1]]; const c = Z[T[3 * t + 2]];
      const lo = Math.floor((Math.min(a, b, c) - zmin) / layer); const hi = Math.floor((Math.max(a, b, c) - zmin) / layer);
      const bit = 1 << (E[t] & 31);
      for (let l = lo; l <= hi; l++) masks[l] |= bit;
    }
    let prev = 0;
    for (let l = 0; l <= layers; l++) {
      const m = masks[l];
      if (!m) continue;
      let n = 0; for (let x = m; x; x &= x - 1) n++;
      swaps += n - 1 + (prev && !(prev & m) ? 1 : 0); // can start each layer on the last colour if it's still needed
      prev = m;
    }
  }
  const support = (meta.slice || []).some((p) => p.support);
  const notes = [];
  let verdict = 'good';
  const worse = (v) => { const order = ['good', 'ok', 'hard', 'no']; if (order.indexOf(v) > order.indexOf(verdict)) verdict = v; };
  if (used.size > 5) { worse('no'); notes.push(`${used.size} colors — the MMU3 has 5`); }
  if (swaps > 600) { worse('hard'); notes.push('lots of color swaps — long print, lots of purge'); } else if (swaps > 150) { worse('ok'); notes.push('a fair few color swaps'); }
  if (plateIds.length > 1) { worse('ok'); notes.push(`${plateIds.length} plates — print each, then put it together`); }
  if (support) { worse('ok'); notes.push('designer used supports'); }
  if (height > 120) { worse('ok'); notes.push('tall — a long print'); }
  return {
    colors: used.size, plates: plateIds.length, swaps,
    swapHours: +((swaps * swapSeconds) / 3600).toFixed(1), purgeGrams: Math.round(swaps * purgeGramsPerSwap),
    height: Math.round(height), support, verdict, notes,
    designer: meta.slice?.length ? { hours: +meta.slice.reduce((s, p) => s + (p.hours || 0), 0).toFixed(1), grams: meta.slice.reduce((s, p) => s + (p.grams || 0), 0) } : null,
  };
}
