// Shared constants and helpers. The world is the 32x32-cell Gauntlet maze drawn at twice
// the arcade's scale (32-pixel cells), so Smash T.V.'s characters fit its corridors at
// their own resolution. The maze wraps (the original's playfield is a torus: the top wall
// is also the bottom wall, and some mazes are open at the sides).

export const DT = 1 / 60;

export const CELL = 32;
export const WORLD = 32 * CELL;

/** Screen layout: the playfield view on the left, the status panel on the right. */
export const VIEW_W = 640;
export const VIEW_H = 432;

/** Shortest signed distance from a to b on the wrapped world axis. */
export function wrapd(d: number): number {
  d %= WORLD;
  if (d > WORLD / 2) d -= WORLD;
  if (d < -WORLD / 2) d += WORLD;
  return d;
}

export const wrap = (v: number) => ((v % WORLD) + WORLD) % WORLD;

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(wrapd(bx - ax), wrapd(by - ay));
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const irand = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
