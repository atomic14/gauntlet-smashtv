// Canvas renderer. Smash T.V. sprites are drawn at their own resolution with the ROM's
// anchor convention:
//   left = x - xoff (flipped: x - (w - 1 - xoff)),  top = y - yoff
// Gauntlet's maze objects are drawn at twice their size, like the maze.
import { assets, anim, type AnimFrame } from './assets';

export const W = 768;
export const H = 432;

export let ctx: CanvasRenderingContext2D;

export function initGfx(canvas: HTMLCanvasElement) {
  ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = false;
}

export function drawFrame([key, flip]: AnimFrame, x: number, y: number, alpha = 1) {
  const f = assets.frames[key];
  if (!f) return;
  const [page, sx, sy, w, h, xoff, yoff] = f;
  const top = Math.round(y - yoff);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    const left = Math.round(x - (w - 1 - xoff));
    ctx.save();
    ctx.translate(left + w, top);
    ctx.scale(-1, 1);
    ctx.drawImage(assets.pages[page], sx, sy, w, h, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(assets.pages[page], sx, sy, w, h, Math.round(x - xoff), top, w, h);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** Draws a frame's raw image with its top-left corner at (x, y), ignoring the anchor. */
export function drawFrameAt([key, flip]: AnimFrame, x: number, y: number) {
  const f = assets.frames[key];
  if (!f) return;
  const [, , , w, , xoff] = f;
  drawFrame([key, flip], x + (flip ? w - 1 - xoff : xoff), y + f[6]);
}

const footCache = new Map<string, { x: number; y: number }>();
/**
 * Offset from an animation's anchor to its "feet" (bottom centre of the first frame), so
 * game objects can be positioned by their feet regardless of how the art was anchored.
 */
export function footOffset(name: string): { x: number; y: number } {
  let o = footCache.get(name);
  if (!o) {
    const [key, flip] = anim(name)[0];
    const [, , , w, h, xoff, yoff] = assets.frames[key];
    const left = flip ? -(w - 1 - xoff) : -xoff;
    o = { x: left + w / 2, y: -yoff + h };
    footCache.set(name, o);
  }
  return o;
}

/** Draw frame `i` of an animation positioned by its feet, with the given foot offset name. */
export function drawAt(name: string, i: number, feetX: number, feetY: number, base = name, alpha = 1) {
  const frames = anim(name);
  const o = footOffset(base);
  drawFrame(frames[((i % frames.length) + frames.length) % frames.length], feetX - o.x, feetY - o.y, alpha);
}

/** Draw a Gauntlet maze object (objects atlas) at twice size, centred on (cx, cy). */
export function drawObj(name: string, cx: number, cy: number, alpha = 1) {
  const f = assets.gauntlet.objFrames[name];
  if (!f) return;
  const [sx, sy, w, h] = f;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(assets.gauntlet.objects, sx, sy, w, h, Math.round(cx - w), Math.round(cy - h), w * 2, h * 2);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// ---- text ---------------------------------------------------------------------------

export type Font = 'big' | 'small';

export function textWidth(s: string, font: Font = 'small'): number {
  let w = 0;
  for (const ch of s) w += glyphAdvance(ch, font);
  return w;
}

function glyphAdvance(ch: string, font: Font) {
  if (ch === ' ') return font === 'big' ? 8 : 6;
  const key = assets.fonts[font][ch] ?? assets.fonts[font][ch.toUpperCase()];
  if (!key) return 0;
  return assets.frames[key][3] + 1;
}

export function drawText(s: string, x: number, y: number, font: Font = 'small', align: 'left' | 'center' | 'right' = 'left') {
  if (align !== 'left') {
    const w = textWidth(s, font);
    x -= align === 'center' ? w / 2 : w;
  }
  x = Math.round(x);
  for (const ch of s) {
    const key = assets.fonts[font][ch] ?? assets.fonts[font][ch.toUpperCase()];
    if (key) {
      // punctuation sits lower in the cell: its anchor offset says by how much
      const [page, sx, sy, w, h, , yoff] = assets.frames[key];
      ctx.drawImage(assets.pages[page], sx, sy, w, h, x, y - yoff, w, h);
    }
    x += glyphAdvance(ch, font);
  }
}

/** Text in a solid colour (the fonts' own colours tinted), via an offscreen canvas. */
const tintCanvas = document.createElement('canvas');
export function drawTextColor(s: string, x: number, y: number, color: string, font: Font = 'small', align: 'left' | 'center' | 'right' = 'left') {
  const w = Math.max(1, textWidth(s, font)), h = font === 'big' ? 16 : 10;
  tintCanvas.width = w;
  tintCanvas.height = h;
  const t = tintCanvas.getContext('2d')!;
  const saved = ctx;
  ctx = t;
  drawText(s, 0, 0, font);
  ctx = saved;
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, w, h);
  if (align !== 'left') x -= align === 'center' ? w / 2 : w;
  ctx.drawImage(tintCanvas, Math.round(x), Math.round(y));
}

export function fillRect(x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
