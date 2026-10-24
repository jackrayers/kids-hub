// Playful bits for kid screens: bouncy multi-colour wordmarks and falling snow.
import { esc } from './api.js';

export const PALETTES = {
  rainbow: ['#e4483f', '#f59a23', '#f5b82e', '#2e9b6a', '#4f8fe8', '#8a5cd6'],
  christmas: ['#ffffff', '#ffe08a', '#ffffff', '#b8f0c8'],
};

/** Splits text into letter spans with alternating colours and tilts. */
export function wordmarkHtml(text, { colors = PALETTES.rainbow, hatFirst = false } = {}) {
  let i = 0;
  return [...text].map((ch) => {
    if (ch === ' ') return '<span class="sp" aria-hidden="true"></span>';
    const n = i++;
    const tilt = (n % 2 ? 1 : -1) * (2 + (n % 3));
    const hat = hatFirst && n === 0 ? ' hat' : '';
    return `<span class="ch${hat}" aria-hidden="true" style="--i:${n};--r:${tilt}deg;color:${colors[n % colors.length]}">${esc(ch)}</span>`;
  }).join('');
}

/** Fills an element with a wordmark, keeping the plain text for screen readers. */
export function setWordmark(el, text, opts) {
  el.setAttribute('aria-label', text);
  el.innerHTML = wordmarkHtml(text, opts);
}

/** Scatters gently falling snowflakes inside a positioned element. */
export function snow(container, count = 26) {
  const flakes = ['❄', '❅', '•', '✦'];
  for (let i = 0; i < count; i++) {
    const f = document.createElement('span');
    f.className = 'flake';
    f.setAttribute('aria-hidden', 'true');
    f.textContent = flakes[i % flakes.length];
    const size = 10 + Math.random() * 16;
    f.style.cssText = `left:${Math.random() * 100}%;font-size:${size}px;` +
      `animation-duration:${7 + Math.random() * 8}s;animation-delay:${-Math.random() * 14}s;` +
      `--sway:${(Math.random() * 60 - 30).toFixed(0)}px;top:${(Math.random() * 80 - 10).toFixed(0)}%`;
    container.append(f);
  }
}
