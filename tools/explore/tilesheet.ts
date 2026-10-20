// Dump a range of tiles with a motion object colour: tilesheet.ts start count color out.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { irgb } from '../../src/game/playfield';
const data = JSON.parse(readFileSync('public/assets/gauntlet/data.json', 'utf8'));
const tiles = readFileSync('public/assets/gauntlet/tiles.bin');
const [start, count, color, out] = process.argv.slice(2);
const s = parseInt(start, 16), n = Number(count), pal = data.palettes.mo[Number(color)].map(irgb);
const cols = 16, S = 4;
const png = new PNG({ width: cols * 10 * S, height: Math.ceil(n / cols) * 10 * S });
for (let i = 0; i < n; i++) {
  const t = (s + i) & 0x1fff;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const b = tiles[t * 32 + y * 4 + (x >> 1)];
    const v = x & 1 ? b & 15 : b >> 4;
    const [R, G, B] = v ? pal[v] : [40, 40, 40];
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const o = ((((i / cols) | 0) * 10 + y) * S + yy) * png.width + ((i % cols) * 10 + x) * S + xx;
      png.data[o * 4] = R; png.data[o * 4 + 1] = G; png.data[o * 4 + 2] = B; png.data[o * 4 + 3] = 255;
    }
  }
}
writeFileSync(out, PNG.sync.write(png));
