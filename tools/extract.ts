// Builds public/assets/gauntlet/ from the Gauntlet ROM set (gauntlet.zip, as used by MAME):
//   tiles.bin     the shared 8x8 tile set, 4 bits per pixel (two pixels a byte, high first)
//   data.json     mazes, the floor/wall autotile tables and the palettes
//   objects.png/.json  the maze objects (generators, food, potions, treasure, keys, doors)
// The Smash T.V. art and sound in public/assets/smashtv come from the smashtv port.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, decodeMaze, u16, irgb, MAZE_COUNT, type Rom } from './gauntlet-rom';

const zip = process.argv[2];
if (!zip) {
  console.error('usage: npm run extract -- /path/to/gauntlet.zip');
  process.exit(1);
}
const OUT = 'public/assets/gauntlet';
mkdirSync(OUT, { recursive: true });
const rom = loadRom(zip);

// ---- tiles --------------------------------------------------------------------------
const packed = new Uint8Array(rom.tiles.length / 2);
for (let i = 0; i < packed.length; i++) packed[i] = (rom.tiles[i * 2] << 4) | rom.tiles[i * 2 + 1];
writeFileSync(`${OUT}/tiles.bin`, packed);

// ---- palettes (loaded per level by 0x413aa) -------------------------------------------
const words = (a: number, n: number) => Array.from({ length: n }, (_, i) => u16(rom, a + 2 * i));
const rows16 = (a: number, n: number) => Array.from({ length: n }, (_, i) => words(a + 32 * i, 16));
const palettes = {
  /** playfield colour 0 and 3, by the floor colour (header byte 9, high nibble) */
  floor: rows16(0xf1c0, 17),
  /** playfield colours 1, 4 and 7 by the wall colour (header byte 9, low nibble) */
  wall: rows16(0xf3e0, 20),
  /** colour 2: exits and transporters */
  exit: words(0xf660, 16),
  /** colours 3-7 when the floor colour is 16 */
  special: rows16(0xf6a0, 5),
  /** motion objects, 16 colours of 16 */
  mo: rows16(0xf740, 16),
};

// ---- autotile tables ---------------------------------------------------------------------
const mazes = Array.from({ length: MAZE_COUNT }, (_, i) => decodeMaze(rom, i + 1));
const wallPatterns = new Set<number>([5]);
for (const m of mazes) wallPatterns.add(m.header[8] & 15);
const wallMap = Array.from(rom.prog.slice(0x9c24, 0x9c24 + 256));
const wallEntries = (Math.max(...wallPatterns) + 1) * 0x44;
const tables = {
  /** 0x4273a: floor cell tiles, 4 words (TL, TR, BL, BR) at [variant*4 + 0x10 L + 0x20 DL + 0x40 D] */
  floor: words(0xa5c0, 0x80),
  /** 0x42b92: wall neighbour mask (UL 1, U 2, UR 4, L 8, R 10, DL 20, D 40, DR 80) -> entry */
  wallMap,
  /** entries of 4 tile words; entry = wallMap[mask] + pattern * 0x44 - 1 */
  wall: words(0xa6c0, wallEntries * 4),
  /** 0x41bda: exit tiles by code - 6 (plain exit, exit to 4, exit to 8) */
  exit: words(0xb380, 12),
  /** 0x41c5a: transporter */
  transporter: words(0xb398, 4),
  /** door piece picture by door-neighbour mask (see the objects atlas, door.<picture>) */
  door: [] as number[],
  /** straight door pieces by end shape (see Game.doorPiece) */
  doorH: [] as { name: string; xoff: number }[],
  doorV: [] as { name: string; xoff: number }[],
};

// ---- levels ---------------------------------------------------------------------------------
const hex = (a: Uint8Array) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
const levels = mazes.map((m) => ({
  header: hex(m.header),
  floorPattern: m.header[8] >> 4,
  wallPattern: m.header[8] & 15,
  floorColor: m.header[9] >> 4,
  wallColor: m.header[9] & 15,
  grid: hex(m.grid),
}));


// ---- maze objects ------------------------------------------------------------------------
// Each code's motion object: picture 0xc534, size/flip 0xc624, colour 0xc660 (see 0x441f6).
// Random food (code 2b) picks a picture from 0xcbe2.
interface Obj { name: string; pic: number; size: number; color: number }
const objs: Obj[] = [];
for (let code = 0x02; code <= 0x35; code++) {
  const pic = u16(rom, 0xc534 + 2 * code);
  if (pic === 0x8000 || pic === 0x8001) continue; // drawn by the playfield
  objs.push({ name: code.toString(16).padStart(2, '0'), pic, size: rom.prog[0xc624 + code], color: rom.prog[0xc660 + code] & 15 });
}
// Doors: 0x43e12 draws a door cell as a 16x16 piece from 0xa020, indexed by which
// neighbours are doors too (up 1, right 2, down 4, left 8).
const doorPics = words(0xa020, 16);
const doorColor = rom.prog[0xc660 + 3] & 15;
for (const pic of new Set(doorPics)) objs.push({ name: `door.${pic.toString(16)}`, pic, size: 0x09, color: doorColor });
// Straight runs (0x43f0c across, 0x44080 down) use 9 pieces each, picked by the walls at
// the run's ends: picture, x offset (in 1/128 px) and size.
const doorRun = (pics: number, offs: number, sizes: number) =>
  Array.from({ length: 9 }, (_, i) => {
    const pic = u16(rom, pics + 2 * i), size = u16(rom, sizes + 2 * i);
    objs.push({ name: `door.${pic.toString(16)}.${size.toString(16)}`, pic, size, color: doorColor });
    return { name: `door.${pic.toString(16)}.${size.toString(16)}`, xoff: u16(rom, offs + 2 * i) >> 7 };
  });
const doorH = doorRun(0xa040, 0xa052, 0xa064);
const doorV = doorRun(0xa076, 0xa088, 0xa09a);
for (let i = 0; i < 3; i++) {
  objs.push({ name: `food${i}`, pic: u16(rom, 0xcbe2 + 2 * i), size: rom.prog[0xc624 + 0x2b], color: rom.prog[0xc660 + 0x2b] & 15 });
}

function renderMo(r: Rom, o: Obj) {
  const w = ((o.size >> 3) & 7) + 1, h = (o.size & 7) + 1;
  const flip = (o.size >> 6) & 1;
  const code = (o.pic & 0x7fff) ^ 0x800;
  const pal = palettes.mo[o.color].map(irgb);
  const px = new Uint8Array(w * 8 * h * 8 * 4);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const t = (code + ty * w + tx) & 0x1fff;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const v = r.tiles[t * 64 + y * 8 + (flip ? 7 - x : x)];
          if (!v) continue;
          const dx = (flip ? w - 1 - tx : tx) * 8 + x;
          const o4 = ((ty * 8 + y) * w * 8 + dx) * 4;
          if (v === 1) {
            // pen 1 is the shadow: the hardware darkens the playfield under it
            px[o4 + 3] = 110;
          } else {
            const c = pal[v];
            px[o4] = c >> 16;
            px[o4 + 1] = (c >> 8) & 255;
            px[o4 + 2] = c & 255;
            px[o4 + 3] = 255;
          }
        }
      }
    }
  }
  return { w: w * 8, h: h * 8, px };
}

tables.door = doorPics;
tables.doorH = doorH;
tables.doorV = doorV;
const rendered = objs.map((o) => ({ o, ...renderMo(rom, o) }));
const atlasW = 512;
let ax = 0, ay = 0, rowH = 0;
const frames: Record<string, [number, number, number, number]> = {};
for (const r of rendered) {
  if (ax + r.w > atlasW) {
    ax = 0;
    ay += rowH + 1;
    rowH = 0;
  }
  frames[r.o.name] = [ax, ay, r.w, r.h];
  ax += r.w + 1;
  rowH = Math.max(rowH, r.h);
}
const png = new PNG({ width: atlasW, height: ay + rowH });
for (const r of rendered) {
  const [x0, y0] = frames[r.o.name];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const s = (y * r.w + x) * 4, t = ((y0 + y) * atlasW + x0 + x) * 4;
      for (let k = 0; k < 4; k++) png.data[t + k] = r.px[s + k];
    }
  }
}
writeFileSync(`${OUT}/objects.png`, PNG.sync.write(png));
writeFileSync(`${OUT}/objects.json`, JSON.stringify(frames));
writeFileSync(`${OUT}/data.json`, JSON.stringify({ palettes, tables, levels }));
console.log(`${levels.length} mazes, ${objs.length} objects, wall patterns ${[...wallPatterns].sort((a, b) => a - b).join(',')}`);
