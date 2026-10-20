// Render a maze with our playfield builder and the extracted object sprites.
// usage: npx tsx tools/explore/render-level.ts <level> out.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { cellTiles, levelPalette, irgb, isWallCode } from '../../src/game/playfield';
const data = JSON.parse(readFileSync('public/assets/gauntlet/data.json', 'utf8'));
const tiles = readFileSync('public/assets/gauntlet/tiles.bin');
const objs = JSON.parse(readFileSync('public/assets/gauntlet/objects.json', 'utf8'));
const atlas = PNG.sync.read(readFileSync('public/assets/gauntlet/objects.png'));
const [lv, out] = process.argv.slice(2);
const L = data.levels[Number(lv) - 1];
const grid = Uint8Array.from(L.grid.match(/../g).map((h: string) => parseInt(h, 16)));
const pal = levelPalette(data.palettes, L.floorColor, L.wallColor).map((row: number[]) => row.map(irgb));
const png = new PNG({ width: 512, height: 512 });
const px = (t: number, x: number, y: number) => {
  const b = tiles[t * 32 + y * 4 + (x >> 1)];
  return x & 1 ? b & 15 : b >> 4;
};
for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) {
  const ws = cellTiles(data.tables, grid, r, c, L.floorPattern, L.wallPattern, (r * 7 + c * 3) & 3);
  ws.forEach((w, k) => {
    const t = (w & 0xfff) ^ 0x800, col = (w >> 12) & 7, flip = w >> 15;
    const ox = c * 16 + (k & 1) * 8, oy = r * 16 + (k >> 1) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const [R, G, B] = pal[col][px(t, flip ? 7 - x : x, y)];
      const o = ((oy + y) * 512 + ox + x) * 4;
      png.data[o] = R; png.data[o + 1] = G; png.data[o + 2] = B; png.data[o + 3] = 255;
    }
  });
}
for (let i = 0; i < 1024; i++) {
  const code = grid[i];
  const name = code === 0x2b ? 'food0' : code.toString(16).padStart(2, '0');
  const f = objs[name];
  if (!f || isWallCode(code)) continue;
  const [sx, sy, w, h] = f;
  const cx = (i & 31) * 16 + 8 - w / 2, cy = (i >> 5) * 16 + 16 - h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((sy + y) * atlas.width + sx + x) * 4;
    const a = atlas.data[s + 3];
    const X = Math.round(cx + x), Y = Math.round(cy + y);
    if (!a || X < 0 || Y < 0 || X >= 512 || Y >= 512) continue;
    const o = (Y * 512 + X) * 4;
    const k = a / 255;
    for (let j = 0; j < 3; j++) png.data[o + j] = png.data[o + j] * (1 - k) + atlas.data[s + j] * k;
  }
}
writeFileSync(out, PNG.sync.write(png));
