// Gauntlet (Atari, 1985) ROM access and maze decoding.
//
// Hardware notes (see MAME src/mame/atari/gauntlet.cpp):
//  - 68010 program ROM. 136037-1307/1308 hold 0x00000-0x0ffff (second half of each chip
//    first), 1409/1410 hold 0x40000-0x4ffff, and 205/206 (the maze data) sit behind the
//    slapstic at 0x38000: four 8K banks seen through one 8K window.
//  - Playfield and motion objects share one tile set: 8 chips 111-118 form four bit planes
//    of 8x8 tiles (stored inverted; the last plane is the most significant bit).
//  - Palette words are IIII RRRR GGGG BBBB.
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

export interface Rom {
  prog: Uint8Array;
  /** One 4-bit pixel per byte, 64 per tile, 0x2000 tiles. */
  tiles: Uint8Array;
}

export function loadRom(zipPath: string): Rom {
  const files = unzipSync(readFileSync(zipPath));
  const chip = (id: string) => {
    const name = Object.keys(files).find((n) => n.includes(`136037-${id}`));
    if (!name) throw new Error(`ROM chip 136037-${id} missing from ${zipPath}`);
    return files[name];
  };
  const prog = new Uint8Array(0x50000);
  const load16 = (id: string, parts: [number, number, number][]) => {
    const d = chip(id);
    let pos = 0;
    for (const [base, odd, len] of parts) {
      for (let i = 0; i < len; i++) prog[base + odd + i * 2] = d[pos + i];
      pos += len;
    }
  };
  load16('1307.9a', [[0x8000, 0, 0x4000], [0x0000, 0, 0x4000]]);
  load16('1308.9b', [[0x8000, 1, 0x4000], [0x0000, 1, 0x4000]]);
  load16('205.10a', [[0x38000, 0, 0x4000]]);
  load16('206.10b', [[0x38000, 1, 0x4000]]);
  load16('1409.7a', [[0x48000, 0, 0x4000], [0x40000, 0, 0x4000]]);
  load16('1410.7b', [[0x48000, 1, 0x4000], [0x40000, 1, 0x4000]]);

  const gfx = ['111.1a', '112.1b', '113.1l', '114.1mn', '115.2a', '116.2b', '117.2l', '118.2mn'].map(chip);
  const all = new Uint8Array(0x40000);
  gfx.forEach((d, i) => all.set(d, i * 0x8000));
  const tiles = new Uint8Array(0x2000 * 64);
  for (let t = 0; t < 0x2000; t++) {
    for (let row = 0; row < 8; row++) {
      for (let x = 0; x < 8; x++) {
        let v = 0;
        for (let p = 0; p < 4; p++) {
          const b = ~all[p * 0x10000 + t * 8 + row] & 0xff;
          v |= ((b >> (7 - x)) & 1) << p;
        }
        tiles[t * 64 + row * 8 + x] = v;
      }
    }
  }
  return { prog, tiles };
}

export const u16 = (rom: Rom, a: number) => (rom.prog[a] << 8) | rom.prog[a + 1];
export const u32 = (rom: Rom, a: number) => ((u16(rom, a) << 16) | u16(rom, a + 2)) >>> 0;

/** Palette word -> 0xRRGGBB (MAME's IRGB_4444 decoder). */
export function irgb(w: number): number {
  const z = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17][w >> 12];
  const r = ((w >> 8) & 15) * z, g = ((w >> 4) & 15) * z, b = (w & 15) * z;
  return (r << 16) | (g << 8) | b;
}

// ---- mazes --------------------------------------------------------------------------

/** The 114 regular mazes are listed at 0x38032 (CPU addresses inside the slapstic window). */
export const MAZE_TABLE = 0x38032;
export const MAZE_COUNT = 114;
/**
 * Slapstic bank of each maze, found by decoding every maze in every bank and keeping the
 * one that both decodes cleanly and ends where another maze in that bank begins.
 */
const BANK_RUNS: [number, number, number][] = [
  [1, 29, 0], [30, 31, 1], [32, 36, 2], [37, 50, 1], [51, 56, 3], [57, 71, 1],
  [72, 72, 2], [73, 77, 3], [78, 93, 2], [94, 99, 3], [100, 114, 2],
];

export function mazeBank(n: number): number {
  for (const [a, z, b] of BANK_RUNS) if (n >= a && n <= z) return b;
  throw new Error(`no maze ${n}`);
}

export interface Maze {
  header: Uint8Array;
  /** 32x32 cell codes, row-major, row 0 at the top (the wall shared by top and bottom). */
  grid: Uint8Array;
}

/**
 * Decode a maze, following the 68010 routine at 0x4ad06. A 14-byte header is followed by a
 * byte stream; each byte is two bits of command and six of data:
 *   00cccccc  one cell of code c
 *   01ttnnnn  code from header byte [0a,0c,0b,0d][t]; its top bits pick a pattern:
 *             00 n+1 of it (a vertical run when it is header byte 0c or 0d), 01 n+1 floor
 *             then it, 10 it then n+1 floor, 11 n+1 wall then it
 *   100nnnnn  n+1 more of the last code
 *   101vnnnn  n+1 wall (v: a vertical run, upward from the current cell)
 *   11w nnnnn n+1 floor, then a wall if w
 * A vertical run (0x44494) fills upwards from the current cell and only advances one cell.
 */
export function decodeMaze(rom: Rom, n: number): Maze {
  const ptr = u32(rom, MAZE_TABLE + 4 * (n - 1));
  const off = 0x38000 + mazeBank(n) * 0x2000 + (ptr & 0x1fff);
  const d = rom.prog;
  const header = d.slice(off, off + 14);
  const tab = [header[0xa], header[0xc], header[0xb], header[0xd]];
  const grid = new Uint8Array(0x400);
  grid.fill(1, 0, 32);
  let pos = 0x20;
  let p = off + 14;
  let last = header[0xb];
  const place = (code: number, k: number) => {
    for (let i = 0; i < k; i++, pos++) if (pos < 0x400) grid[pos] = code;
  };
  const vplace = (code: number, k: number) => {
    if (code) for (let i = 0; i < k; i++) if (pos - 32 * i >= 0 && pos - 32 * i < 0x400) grid[pos - 32 * i] = code;
    pos++;
  };
  while (pos < 0x400) {
    const b = d[p++];
    const n5 = b & 0x1f;
    switch (b & 0xc0) {
      case 0x00:
        last = b;
        place(b & 0x3f, 1);
        break;
      case 0x40: {
        last = tab[(b >> 4) & 3];
        const k = (b & 0xf) + 1;
        const code = last & 0x3f;
        switch (last & 0xc0) {
          case 0x00:
            if (last === header[0xc] || last === header[0xd]) vplace(code, k);
            else place(code, k);
            break;
          case 0x40: place(0, k); place(code, 1); break;
          case 0x80: place(code, 1); place(0, k); break;
          default: place(1, k); place(code, 1);
        }
        break;
      }
      case 0x80:
        if (b & 0x20) (b & 0x10 ? vplace : place)(1, (b & 0xf) + 1);
        else place(last & 0x3f, n5 + 1);
        break;
      default:
        place(0, n5 + 1);
        if (b & 0x20) place(1, 1);
    }
  }
  if (pos !== 0x400) throw new Error(`maze ${n} overran (${pos})`);
  return { header, grid };
}
