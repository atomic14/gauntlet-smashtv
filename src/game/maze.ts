// A level's maze at run time: the cell grid (which changes as doors open, walls fall and
// things are picked up), its playfield image drawn with the original's tile rules, and
// collision.
import { assets, type LevelData } from '../assets';
import { C, cellTiles, levelPalette, irgb, isWallCode } from './playfield';
import { CELL, WORLD, wrap } from './world';

export const MONSTER_CODES = { ghost: 0x09, grunt: 0x0c, demon: 0x0f, lobber: 0x12, sorcerer: 0x15 } as const;
export type MonsterKind = keyof typeof MONSTER_CODES | 'death';
export const KINDS = ['ghost', 'grunt', 'demon', 'lobber', 'sorcerer'] as const;

/** A monster cell code -> kind and level (1-3). */
export function monsterAt(code: number): { kind: MonsterKind; level: number } | null {
  if (code === C.DEATH) return { kind: 'death', level: 3 };
  if (code >= 0x09 && code <= 0x17) return { kind: KINDS[Math.floor((code - 9) / 3)], level: ((code - 9) % 3) + 1 };
  return null;
}

/** A generator cell code -> the kind it spawns and its level (1-3). */
export function generatorAt(code: number): { kind: MonsterKind; level: number } | null {
  if (code >= 0x19 && code <= 0x27) return { kind: KINDS[Math.floor((code - 0x19) / 3)], level: ((code - 0x19) % 3) + 1 };
  return null;
}

export const isDoor = (c: number) => c === C.DOOR_H || c === C.DOOR_V;
export const isExit = (c: number) => c >= C.EXIT && c <= C.EXIT8;

export class Maze {
  grid: Uint8Array;
  /** Cells taken by generators (solid until destroyed). */
  blocked = new Uint8Array(1024);
  /** Picture for each random food cell. */
  food = new Map<number, string>();
  readonly canvas = document.createElement('canvas');
  private img: ImageData;
  private variant = new Uint8Array(1024);
  private pal: [number, number, number][][];
  private cx: CanvasRenderingContext2D;

  constructor(public data: LevelData) {
    this.grid = Uint8Array.from(data.grid.match(/../g)!.map((h) => parseInt(h, 16)));
    for (let i = 0; i < 1024; i++) {
      this.variant[i] = Math.floor(Math.random() * 4);
      if (this.grid[i] === C.FOOD) this.food.set(i, `food${Math.floor(Math.random() * 3)}`);
    }
    const g = assets.gauntlet;
    this.pal = levelPalette(g.palettes, data.floorColor, data.wallColor).map((row) => row.map(irgb));
    this.canvas.width = this.canvas.height = 512;
    this.cx = this.canvas.getContext('2d')!;
    this.img = this.cx.createImageData(512, 512);
    for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) this.paintCell(r, c);
    this.cx.putImageData(this.img, 0, 0);
  }

  /** Horizontal wrap-around: mazes with an open left wall (header byte 7 bit 3). */
  get wraps() {
    for (let r = 1; r < 32; r++) if (!isWallCode(this.grid[r * 32])) return true;
    return false;
  }

  private paintCell(r: number, c: number) {
    const { tables, tiles } = assets.gauntlet;
    const words = cellTiles(tables, this.grid, r, c, this.data.floorPattern, this.data.wallPattern, this.variant[r * 32 + c]);
    const d = this.img.data;
    for (let k = 0; k < 4; k++) {
      const w = words[k];
      const t = (w & 0xfff) ^ 0x800;
      const pal = this.pal[(w >> 12) & 7];
      const flip = w >> 15;
      const ox = c * 16 + (k & 1) * 8, oy = r * 16 + (k >> 1) * 8;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const sx = flip ? 7 - x : x;
          const b = tiles[t * 32 + y * 4 + (sx >> 1)];
          const [R, G, B] = pal[sx & 1 ? b & 15 : b >> 4];
          const o = ((oy + y) * 512 + ox + x) * 4;
          d[o] = R;
          d[o + 1] = G;
          d[o + 2] = B;
          d[o + 3] = 255;
        }
      }
    }
  }

  get(col: number, row: number) {
    return this.grid[(row & 31) * 32 + (col & 31)];
  }

  /** Change a cell and redraw it and its neighbours (the original's 0x42898). */
  set(col: number, row: number, code: number) {
    col &= 31;
    row &= 31;
    this.grid[row * 32 + col] = code;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        this.paintCell((row + dr) & 31, (col + dc) & 31);
      }
    }
    // the 3x3 block may wrap around the edges, so put each cell back separately
    for (let dr = -1; dr <= 1; dr++) {
      const rr = (row + dr) & 31;
      for (let dc = -1; dc <= 1; dc++) {
        const cc = (col + dc) & 31;
        this.cx.putImageData(this.img, 0, 0, cc * 16, rr * 16, 16, 16);
      }
    }
  }

  /** Cells that stop the players and the monsters. */
  solidCell(col: number, row: number) {
    const i = (row & 31) * 32 + (col & 31);
    const c = this.grid[i];
    return (row & 31) === 0 || isWallCode(c) || isDoor(c) || this.blocked[i] === 1;
  }

  /** Is the box [x0,x1) x [y0,y1) (world pixels) clear of solid cells? */
  boxClear(x0: number, y0: number, x1: number, y1: number, extra?: (col: number, row: number) => boolean) {
    const c0 = Math.floor(x0 / CELL), c1 = Math.floor((x1 - 0.01) / CELL);
    const r0 = Math.floor(y0 / CELL), r1 = Math.floor((y1 - 0.01) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.solidCell(c, r) || extra?.(c & 31, r & 31)) return false;
      }
    }
    return true;
  }

  /** Line of sight between two world points (no walls or doors in the way). */
  clearLine(ax: number, ay: number, dx: number, dy: number) {
    const n = Math.ceil(Math.hypot(dx, dy) / 12);
    for (let i = 1; i < n; i++) {
      const x = wrap(ax + (dx * i) / n), y = wrap(ay + (dy * i) / n);
      const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
      const code = this.get(c, r);
      if (r === 0 || isWallCode(code) || isDoor(code)) return false;
    }
    return true;
  }

  /** Draw the maze so that world point (camX, camY) is at the view's top-left. */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number) {
    const x0 = -(wrap(camX)), y0 = -(wrap(camY));
    for (let oy = y0; oy < viewH; oy += WORLD) {
      for (let ox = x0; ox < viewW; ox += WORLD) {
        ctx.drawImage(this.canvas, Math.round(ox), Math.round(oy), WORLD, WORLD);
      }
    }
  }
}
