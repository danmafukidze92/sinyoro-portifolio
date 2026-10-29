import * as THREE from 'three';

export const FONT_DISPLAY = '"Bricolage Grotesque Variable", "Segoe UI", sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

let maxAniso = 4;
export function setMaxAnisotropy(v) { maxAniso = Math.min(8, v || 4); }

/** Wrap text into lines that fit `maxWidth` on the given context. */
export function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw onto a fresh canvas and return a texture. */
export function canvasTexture(width, height, draw) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  draw(ctx, width, height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Big painted words lying on the ground (transparent background). */
export function groundText(text, { size = 120, color = 'rgba(120,62,24,0.55)', sub = null, subColor } = {}) {
  const w = 1024, h = sub ? 320 : 220;
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = color;
    let fs = size;
    ctx.font = `800 ${fs}px ${FONT_DISPLAY}`;
    while (ctx.measureText(text).width > w - 40 && fs > 20) { fs -= 2; ctx.font = `800 ${fs}px ${FONT_DISPLAY}`; }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, sub ? 120 : h / 2);
    if (sub) {
      ctx.font = `500 44px ${FONT_MONO}`;
      ctx.fillStyle = subColor || color;
      ctx.fillText(sub, w / 2, 250);
    }
  });
}
