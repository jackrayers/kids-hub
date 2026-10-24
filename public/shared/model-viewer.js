// A tiny WebGL viewer for KHM1 preview meshes: spin with a finger, recolor slots live.
// No libraries, so it loads fast on kids' tablets.

const VS = `
attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uMVP; uniform mat3 uNormal;
varying vec3 vN; varying vec3 vPos;
void main() { vN = normalize(uNormal * aNormal); vPos = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }`;
const FS = `
precision mediump float;
uniform vec3 uColor; varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  vec3 key = normalize(vec3(-0.45, 0.7, 0.55));
  vec3 fill = normalize(vec3(0.6, 0.2, 0.4));
  float d = max(dot(n, key), 0.0);
  float f = max(dot(n, fill), 0.0) * 0.25;
  float rim = pow(1.0 - max(n.z, 0.0), 2.0) * 0.18;
  float spec = pow(max(dot(n, normalize(key + vec3(0.0, 0.0, 1.0))), 0.0), 28.0) * 0.18;
  vec3 c = uColor * (0.42 + 0.62 * d + f) + vec3(spec + rim);
  gl_FragColor = vec4(c, 1.0);
}`;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  // sRGB-ish → slightly linearised so dark filaments don't look grey
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 1.1));
}

/** Parses a KHM1 preview into positions (Y up), normals, indices and color groups. */
export function parseKhm(buffer) {
  const bytes = new Uint8Array(buffer);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'KHM1') throw new Error('Not a model preview');
  const hLen = new DataView(buffer).getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hLen)));
  const pad4 = (n) => (n + 3) & ~3;
  const posOff = 8 + pad4(hLen);
  const q = new Int16Array(buffer, posOff, head.nv * 3);
  const idxOff = pad4(posOff + q.byteLength);
  const idx = head.index32 ? new Uint32Array(buffer, idxOff, head.ni) : new Uint16Array(buffer, idxOff, head.ni);
  // Dequantise; 3MF is Z-up, WebGL here is Y-up: (x, y, z) → (x, z, -y). Centre on the model.
  const c = [0, 1, 2].map((k) => (head.min[k] + head.max[k]) / 2);
  const pos = new Float32Array(head.nv * 3);
  let radius = 0;
  for (let i = 0; i < head.nv; i++) {
    const v = [0, 1, 2].map((k) => head.min[k] + ((q[3 * i + k] + 32768) / 65535) * (head.max[k] - head.min[k]) - c[k]);
    pos[3 * i] = v[0]; pos[3 * i + 1] = v[2]; pos[3 * i + 2] = -v[1];
    radius = Math.max(radius, Math.hypot(v[0], v[1], v[2]));
  }
  // Smooth normals.
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3; const b = idx[t + 1] * 3; const d = idx[t + 2] * 3;
    const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[d] - pos[a]; const vy = pos[d + 1] - pos[a + 1]; const vz = pos[d + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const o of [a, b, d]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  return { pos, nrm, idx, index32: head.index32, groups: head.groups, radius, height: head.max[2] - head.min[2] };
}

export class ModelViewer {
  constructor(canvas, { transparent = true, autoRotate = true, pitch = 0.3, yaw = 0.6 } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: transparent, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('This device can’t show 3D models');
    this.gl = gl;
    this.colors = {};
    this.yaw = yaw; this.pitch = pitch; this.autoRotate = autoRotate;
    this.mesh = null;
    this.ext32 = gl.getExtension('OES_element_index_uint');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'), aNormal: gl.getAttribLocation(prog, 'aNormal'),
      uMVP: gl.getUniformLocation(prog, 'uMVP'), uNormal: gl.getUniformLocation(prog, 'uNormal'), uColor: gl.getUniformLocation(prog, 'uColor'),
    };
    this._bindPointer();
    this._loop = this._loop.bind(this);
    this._resize = () => this.resize();
    addEventListener('resize', this._resize);
    this.resize();
  }

  async load(urlOrBuffer) {
    const buf = typeof urlOrBuffer === 'string' ? await (await fetch(urlOrBuffer)).arrayBuffer() : urlOrBuffer;
    const m = parseKhm(buf);
    const gl = this.gl;
    if (m.index32 && !this.ext32) throw new Error('This model is too detailed for this device');
    const mk = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    this.mesh = { ...m, vbo: mk(gl.ARRAY_BUFFER, m.pos), nbo: mk(gl.ARRAY_BUFFER, m.nrm), ibo: mk(gl.ELEMENT_ARRAY_BUFFER, m.idx) };
    this.render();
    if (this.autoRotate && !this._raf) this._raf = requestAnimationFrame(this._loop);
    return this;
  }

  /** colors: { [extruder]: '#RRGGBB' } */
  setColors(colors) { this.colors = { ...this.colors, ...colors }; this.render(); }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round((r.width || this.canvas.width) * dpr));
    const h = Math.max(1, Math.round((r.height || this.canvas.height) * dpr));
    if (r.width && (this.canvas.width !== w || this.canvas.height !== h)) { this.canvas.width = w; this.canvas.height = h; }
    this.render();
  }

  render() {
    const gl = this.gl; const m = this.mesh;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!m) return;
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
    const aspect = this.canvas.width / this.canvas.height;
    const fov = 0.6; const dist = (m.radius / Math.sin(fov / 2)) * 1.02 / Math.min(1, aspect);
    const proj = perspective(fov, aspect, dist * 0.1, dist * 10);
    const model = mul(rotX(this.pitch), rotY(this.yaw));
    const view = translate(0, 0, -dist);
    gl.uniformMatrix4fv(this.loc.uMVP, false, mul(proj, mul(view, model)));
    gl.uniformMatrix3fv(this.loc.uNormal, false, normal3(model));
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nbo);
    gl.enableVertexAttribArray(this.loc.aNormal);
    gl.vertexAttribPointer(this.loc.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    const type = m.index32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const size = m.index32 ? 4 : 2;
    for (const g of m.groups) {
      gl.uniform3fv(this.loc.uColor, hexToRgb(this.colors[g.extruder] || '#C8C8C8'));
      gl.drawElements(gl.TRIANGLES, g.count, type, g.start * size);
    }
  }

  _loop(t) {
    if (this._destroyed) return;
    if (this.autoRotate && !this._dragging) {
      const dt = this._last ? Math.min(50, t - this._last) : 16;
      this.yaw += dt * 0.00035;
      this.render();
    }
    this._last = t;
    this._raf = requestAnimationFrame(this._loop);
  }

  _bindPointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    let px = 0; let py = 0;
    c.addEventListener('pointerdown', (e) => { this._dragging = true; px = e.clientX; py = e.clientY; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this.yaw += (e.clientX - px) * 0.01;
      this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch + (e.clientY - py) * 0.006));
      px = e.clientX; py = e.clientY;
      this.render();
    });
    const up = () => { this._dragging = false; this._last = 0; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  /** Transparent snapshot of the current view. */
  snapshot(type = 'image/webp', quality = 0.9) {
    this.render();
    return new Promise((res) => this.canvas.toBlob((b) => {
      if (b && b.type === type) res(b);
      else this.canvas.toBlob(res, 'image/png');
    }, type, quality));
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    removeEventListener('resize', this._resize);
  }
}

// --- tiny matrix helpers (column-major, like WebGL) ---
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2); const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function translate(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
function rotY(a) { const c = Math.cos(a); const s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
function rotX(a) { const c = Math.cos(a); const s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
function normal3(m) { return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); }
