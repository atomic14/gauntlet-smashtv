// The original's playfield builder: which 2x2 tiles each maze cell draws, and the level
// palette. Ported from the 68010 code (floor 0x4273a, walls 0x42b92, exits 0x41bda,
// palette 0x413aa); the tables are extracted from the ROM by tools/extract.ts.

export interface PfTables {
  floor: number[];
  wallMap: number[];
  wall: number[];
  exit: number[];
  transporter: number[];
}

export interface Palettes {
  floor: number[][];
  wall: number[][];
  exit: number[];
  special: number[][];
  mo: number[][];
}

/** Maze cell codes (see tools/gauntlet-rom.ts and the README). */
export const C = {
  FLOOR: 0x00,
  WALL: 0x01,
  DOOR_H: 0x03,
  DOOR_V: 0x04,
  START: 0x05,
  EXIT: 0x06,
  EXIT4: 0x07,
  EXIT8: 0x08,
  DEATH: 0x18,
  TREASURE: 0x28,
  MONEYBAG: 0x29,
  CIDER: 0x2a,
  FOOD: 0x2b,
  /** blue potion: carried, used for magic; a shot sets it off */
  POTION: 0x2c,
  /** orange potion: as the blue one, but shots don't harm it */
  POTION2: 0x2d,
  AMULET: 0x2e,
  KEY: 0x35,
  /** destructible wall, damaged (0x38 -> 0x37 -> 0x36 -> gone) */
  WALL_HIT2: 0x36,
  WALL_HIT1: 0x37,
  WALL_BREAK: 0x38,
  /** wall removed by stepping on a trap */
  WALL_TRAP: 0x39,
  TRAP: 0x3a,
  TRANSPORTER: 0x3b,
} as const;

/** Cells the playfield draws as wall (motion object picture 0x8000 in the original). */
export function isWallCode(c: number) {
  return c === C.WALL || (c >= C.WALL_HIT2 && c <= C.WALL_TRAP);
}

/** 0x426c8: is (row, col) a wall? The maze wraps; the top row is always wall. */
export function wallAt(grid: Uint8Array, row: number, col: number) {
  const i = (row & 31) * 32 + (col & 31);
  return i < 32 || isWallCode(grid[i]);
}

/**
 * The four tile words (top-left, top-right, bottom-left, bottom-right) for a cell. A word
 * is the playfield RAM format: tile in bits 0-11 (xor 0x800 for the tile index), colour in
 * 12-14, horizontal flip in 15. `variant` (0-3) picks one of the random floor tiles.
 */
export function cellTiles(t: PfTables, grid: Uint8Array, row: number, col: number, floorPattern: number, wallPattern: number, variant: number): number[] {
  const code = grid[row * 32 + col];
  if (row === 0 || isWallCode(code)) {
    let m = 0;
    const n = (dr: number, dc: number, bit: number) => {
      if (wallAt(grid, row + dr, col + dc)) m |= bit;
    };
    n(-1, -1, 1); n(-1, 0, 2); n(-1, 1, 4); n(0, -1, 8); n(0, 1, 0x10); n(1, -1, 0x20); n(1, 0, 0x40); n(1, 1, 0x80);
    const c = row === 0 ? C.WALL : code;
    const pattern = c >= C.WALL_HIT2 && c <= C.WALL_BREAK ? 5 : wallPattern;
    const color = c === C.WALL ? 0x1000 : c === C.WALL_TRAP ? 0x4000 : ((c - C.WALL_HIT2) << 12) + 0x5000;
    const e = (t.wallMap[m] + pattern * 0x44 - 1) * 4;
    return [0, 1, 2, 3].map((k) => (t.wall[e + k] + color) & 0xffff);
  }
  if (code >= C.EXIT && code <= C.EXIT8) return [0, 1, 2, 3].map((k) => (t.exit[(code - C.EXIT) * 4 + k] + 0x2000) & 0xffff);
  if (code === C.TRANSPORTER) return [0, 1, 2, 3].map((k) => (t.transporter[k] + 0x2000) & 0xffff);
  let d = variant * 4;
  if (wallAt(grid, row, col - 1)) d += 0x10;
  if (wallAt(grid, row + 1, col - 1)) d += 0x20;
  if (wallAt(grid, row + 1, col)) d += 0x40;
  const add = floorPattern * 0x30 + (code === C.TRAP ? 0x3000 : 0);
  return [0, 1, 2, 3].map((k) => (t.floor[d + k] + add) & 0xffff);
}

const sub = (row: number[], s: number) => row.map((w) => Math.max(0, w - s));

/** The playfield's 8 colours of 16 palette words for a level (0x413aa). */
export function levelPalette(p: Palettes, floorColor: number, wallColor: number): number[][] {
  const wall = p.wall[wallColor];
  if (floorColor === 16) return [p.floor[16], wall, p.exit, ...p.special];
  const c6 = sub(wall, 0x5000);
  return [p.floor[floorColor], wall, p.exit, p.floor[floorColor], wall, sub(c6, 0x3000), c6, wall];
}

/** Palette word -> [r, g, b] (MAME's IRGB_4444). */
export function irgb(w: number): [number, number, number] {
  const z = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17][w >> 12];
  return [((w >> 8) & 15) * z, ((w >> 4) & 15) * z, (w & 15) * z];
}
