// The letter's border: outline drawings for kids to colour in — holly in the corners,
// and stars, candy canes, ornaments, bells, presents, stockings, mittens, trees,
// snowmen, gingerbread and snowflakes around the edges. One SVG in paper units
// (850 × 1100 = 8.5 × 11 in at 100/in), used for the screen preview and the PDF.

const stroke = (w = 3.2) => `fill="#fff" stroke="#222" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const STROKE = stroke();

// Each drawing fits a 100 × 100 box.
const ICONS = {
  star: '<path d="M50 6 L62 37 L95 38 L69 58 L79 91 L50 72 L21 91 L31 58 L5 38 L38 37 Z"/>',
  cane: '<path d="M38 94 V34 C38 6 82 6 82 34 V42 H66 V34 C66 22 54 22 54 34 V94 Z"/><path d="M38 80 L54 70 M38 64 L54 54 M38 48 L54 38 M42 26 L56 30 M60 14 L64 28 M74 20 L68 32" fill="none"/>',
  ornament: '<circle cx="50" cy="58" r="34"/><rect x="40" y="14" width="20" height="12" rx="2"/><path d="M45 14 C45 4 55 4 55 14" fill="none"/><path d="M17 52 L28 62 L39 52 L50 62 L61 52 L72 62 L83 52" fill="none"/><path d="M20 72 H80" fill="none"/>',
  bell: '<path d="M50 14 C30 14 26 34 26 52 C26 64 18 70 14 76 H86 C82 70 74 64 74 52 C74 34 70 14 50 14 Z"/><circle cx="50" cy="84" r="8"/><path d="M50 14 C40 4 30 8 34 14 Z M50 14 C60 4 70 8 66 14 Z"/>',
  present: '<rect x="12" y="40" width="76" height="52" rx="3"/><rect x="8" y="28" width="84" height="16" rx="3"/><path d="M44 28 V92 M56 28 V92" fill="none"/><path d="M50 28 C38 10 22 16 30 26 C34 30 44 28 50 28 C56 28 66 30 70 26 C78 16 62 10 50 28 Z"/>',
  stocking: '<path d="M34 22 H70 V62 C70 74 64 84 50 88 L30 94 C16 98 8 82 20 74 L34 64 Z"/><rect x="30" y="8" width="44" height="18" rx="5"/><path d="M46 44 L52 50 L46 56 M58 34 L64 40 L58 46" fill="none"/>',
  mitten: '<path d="M30 74 V40 C30 18 64 14 68 36 L70 46 C76 38 88 42 84 54 L74 74 Z"/><rect x="26" y="72" width="52" height="20" rx="5"/><path d="M40 50 L46 44 L52 50 L58 44" fill="none"/>',
  tree: '<path d="M50 10 L76 44 H62 L84 70 H66 L90 94 H10 L34 70 H16 L38 44 H24 Z"/><rect x="42" y="94" width="16" height="6"/><circle cx="44" cy="58" r="4"/><circle cx="60" cy="78" r="4"/><circle cx="36" cy="84" r="4"/>',
  snowman: '<circle cx="50" cy="70" r="24"/><circle cx="50" cy="34" r="16"/><rect x="36" y="6" width="28" height="16" rx="2"/><rect x="28" y="20" width="44" height="6" rx="2"/><circle cx="44" cy="32" r="2" fill="#222"/><circle cx="56" cy="32" r="2" fill="#222"/><path d="M50 37 L60 40 L50 41 Z"/><path d="M36 50 C44 56 56 56 64 50" fill="none"/><circle cx="50" cy="64" r="2.5" fill="#222"/><circle cx="50" cy="76" r="2.5" fill="#222"/>',
  gingerbread: '<path d="M50 6 C38 6 34 16 36 24 C38 30 40 32 36 34 L18 38 C8 40 10 54 20 52 L34 50 L26 84 C24 94 38 96 40 86 L50 66 L60 86 C62 96 76 94 74 84 L66 50 L80 52 C90 54 92 40 82 38 L64 34 C60 32 62 30 64 24 C66 16 62 6 50 6 Z"/><circle cx="45" cy="18" r="2.2" fill="#222"/><circle cx="55" cy="18" r="2.2" fill="#222"/><path d="M44 25 C48 29 52 29 56 25" fill="none"/><circle cx="50" cy="42" r="3"/><circle cx="50" cy="54" r="3"/><path d="M14 44 L22 46 M78 46 L86 44" fill="none"/>',
  snowflake: '<g fill="none"><path d="M50 8 V92 M14 29 L86 71 M86 29 L14 71"/><path d="M42 16 L50 24 L58 16 M42 84 L50 76 L58 84 M20 40 L28 37 L25 28 M80 60 L72 63 L75 72 M75 28 L72 37 L80 40 M25 72 L28 63 L20 60"/></g><circle cx="50" cy="50" r="7"/>',
  candle: '<rect x="36" y="40" width="28" height="54" rx="3"/><path d="M50 8 C40 22 40 32 50 36 C60 32 60 22 50 8 Z"/><path d="M36 58 C44 54 56 62 64 58" fill="none"/>',
};

const HOLLY = `<g ${stroke(3)}>
  <g transform="translate(60 60) rotate(-160)"><path d="M0 0 Q5.0 -1.9 10 -8.3 Q16.0 -5.5 22 -15.3 Q28.0 -7.6 34 -16.8 Q40.0 -6.9 46 -12.3 Q54.0 -3.0 62 0 Q54.0 3.0 46 12.3 Q40.0 6.9 34 16.8 Q28.0 7.6 22 15.3 Q16.0 5.5 10 8.3 Q5.0 1.9 0 0 Z"/><path d="M4 0 H56" fill="none" stroke-width="2"/></g>
  <g transform="translate(60 60) rotate(-70)"><path d="M0 0 Q5.0 -1.9 10 -8.3 Q16.0 -5.5 22 -15.3 Q28.0 -7.6 34 -16.8 Q40.0 -6.9 46 -12.3 Q54.0 -3.0 62 0 Q54.0 3.0 46 12.3 Q40.0 6.9 34 16.8 Q28.0 7.6 22 15.3 Q16.0 5.5 10 8.3 Q5.0 1.9 0 0 Z"/><path d="M4 0 H56" fill="none" stroke-width="2"/></g>
  <circle cx="64" cy="66" r="9"/><circle cx="79" cy="70" r="8"/><circle cx="69" cy="81" r="8"/>
</g>`;

// [icon, x, y, size, rotation] — centres, in paper units. Corners are holly.
const PLACES = [
  // top edge
  ['star', 205, 58, 62, -10], ['ornament', 318, 52, 66, 6], ['bell', 425, 50, 64, -4], ['present', 532, 52, 66, 8], ['star', 645, 58, 62, 12],
  // bottom edge
  ['gingerbread', 205, 1042, 70, 8], ['tree', 318, 1040, 72, -4], ['snowman', 425, 1038, 74, 0], ['present', 532, 1042, 66, -8], ['cane', 645, 1040, 70, 10],
  // left edge
  ['cane', 52, 222, 68, -8], ['snowflake', 50, 334, 58, 0], ['stocking', 52, 448, 70, 6], ['ornament', 50, 562, 62, -6], ['mitten', 52, 676, 66, 4], ['candle', 50, 790, 62, -4], ['bell', 52, 900, 62, 6],
  // right edge
  ['bell', 798, 222, 62, 8], ['mitten', 800, 334, 66, -6], ['snowflake', 800, 448, 58, 0], ['stocking', 798, 562, 70, -6], ['star', 800, 676, 60, 8], ['ornament', 800, 790, 62, 4], ['cane', 798, 900, 68, -10],
];

const SNOWDOTS = [[150, 120], [700, 118], [120, 980], [730, 985], [262, 96], [588, 96], [262, 1004], [588, 1004]];

export function borderSvg() {
  const holly = (x, y, sx, sy) => `<g transform="translate(${x} ${y}) scale(${sx * 1.22} ${sy * 1.22})">${HOLLY}</g>`;
  const items = PLACES.map(([k, x, y, s, r]) =>
    `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s / 100}) translate(-50 -50)" ${STROKE}>${ICONS[k]}</g>`).join('');
  const dots = SNOWDOTS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" ${stroke(2.4)}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1100" preserveAspectRatio="none">
    ${holly(4, 4, 1, 1)}${holly(846, 4, -1, 1)}${holly(4, 1096, 1, -1)}${holly(846, 1096, -1, -1)}
    ${items}${dots}
  </svg>`;
}
