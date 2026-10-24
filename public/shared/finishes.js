// Filament finishes: how a spool looks on the swatch and in the 3D viewer.
// `code` is what the viewer's shader switches on; `second` says what the second color is for.
export const FINISHES = [
  { id: 'solid', code: 0, label: 'Plain' },
  { id: 'matte', code: 1, label: 'Matte' },
  { id: 'silk', code: 2, label: 'Silk', second: 'Dual silk 2nd color (optional)' },
  { id: 'marble', code: 3, label: 'Marble', second: 'Vein color' },
  { id: 'sparkle', code: 4, label: 'Sparkle / galaxy', second: 'Fleck color' },
  { id: 'rainbow', code: 5, label: 'Rainbow' },
  { id: 'wood', code: 6, label: 'Wood', second: 'Grain color' },
  { id: 'glow', code: 7, label: 'Glow in the dark' },
];
export const FINISH_IDS = FINISHES.map((f) => f.id);
export const finishOf = (id) => FINISHES.find((f) => f.id === id) || FINISHES[0];

function mixHex(hex, to, t) {
  const a = parseInt(hex.slice(1), 16); const b = parseInt(to.slice(1), 16);
  const ch = (n, s) => (n >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return `#${((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)}`;
}
const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };

/** The second color actually used (veins, flecks, grain), with sensible defaults. */
export function secondColor(f) {
  if (f.hex2) return f.hex2;
  switch (f.finish) {
    case 'marble': return luma(f.hex) > 0.5 ? mixHex(f.hex, '#2b2b33', 0.6) : mixHex(f.hex, '#ffffff', 0.7);
    case 'sparkle': return luma(f.hex) > 0.75 ? '#c9a227' : '#ffffff';
    case 'wood': return mixHex(f.hex, '#2a1606', 0.45);
    default: return f.hex;
  }
}

/** CSS background for a round swatch. */
export function swatchBackground(f) {
  const hex = f.hex; const two = secondColor(f);
  switch (f.finish) {
    case 'matte': return `radial-gradient(circle at 35% 30%, ${mixHex(hex, '#ffffff', 0.12)}, ${hex} 60%)`;
    case 'silk': return `linear-gradient(135deg, ${mixHex(two, '#000000', 0.15)} 0%, ${mixHex(hex, '#ffffff', 0.55)} 38%, ${hex} 55%, ${two} 100%)`;
    case 'marble': return [
      `linear-gradient(118deg, transparent 38%, ${two} 41%, transparent 44%)`,
      `linear-gradient(62deg, transparent 60%, ${two}cc 62%, transparent 65%)`,
      `linear-gradient(160deg, transparent 18%, ${two}99 21%, transparent 24%)`,
      `linear-gradient(30deg, transparent 78%, ${two}88 80%, transparent 82%)`, hex].join(', ');
    case 'sparkle': return [[28, 30], [66, 22], [52, 58], [22, 70], [78, 66], [40, 44], [62, 84]]
      .map(([x, y], i) => `radial-gradient(circle at ${x}% ${y}%, ${two} 0 ${i % 2 ? 1.5 : 2}px, transparent ${i % 2 ? 2 : 2.6}px)`)
      .concat(`radial-gradient(circle at 35% 30%, ${mixHex(hex, '#ffffff', 0.18)}, ${hex} 70%)`).join(', ');
    case 'rainbow': return 'conic-gradient(from 200deg, #ff4d4d, #ffa64d, #ffe14d, #5fd35f, #4da6ff, #9b6bff, #ff4dd2, #ff4d4d)';
    case 'wood': return `repeating-radial-gradient(circle at 15% 120%, ${hex} 0 5px, ${two} 6px 7px, ${hex} 8px 10px)`;
    case 'glow': return `radial-gradient(circle, ${mixHex(hex, '#ffffff', 0.5)} 0%, ${hex} 55%, ${mixHex(hex, '#000000', 0.15)} 100%)`;
    default: return hex;
  }
}

/** What the viewer needs for one slot. */
export function viewerColor(f) {
  if (!f) return { hex: '#C8C8C8', hex2: '#C8C8C8', code: 0 };
  return { hex: f.hex, hex2: secondColor(f), code: finishOf(f.finish).code };
}
