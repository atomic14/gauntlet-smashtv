// Compare our playfield builder with a MAME dump of playfield RAM (900000-901fff).
// usage: npx tsx tools/explore/check-pf.ts <level> <pf.bin> [mo.bin]
import { readFileSync } from 'node:fs';
import { cellTiles } from '../../src/game/playfield';
const data = JSON.parse(readFileSync('public/assets/gauntlet/data.json', 'utf8'));
const [lv, pfPath, moPath] = process.argv.slice(2);
const L = data.levels[Number(lv) - 1];
const grid = Uint8Array.from(L.grid.match(/../g).map((h: string) => parseInt(h, 16)));
if (moPath) {
  // use the live maze codes (link word >> 10) where available
  const mo = readFileSync(moPath);
  for (let i = 0; i < 1024; i++) {
    const v = (mo[0x1800 + 2 * i] << 8) | mo[0x1800 + 2 * i + 1];
    if (grid[i] !== v >> 10) console.log('grid diff', i, grid[i].toString(16), (v >> 10).toString(16));
  }
}
const pf = readFileSync(pfPath);
const word = (col: number, row: number) => (pf[(col * 64 + row) * 2] << 8) | pf[(col * 64 + row) * 2 + 1];
let bad = 0, floorVar = 0;
for (let r = 0; r < 32; r++) {
  for (let c = 0; c < 32; c++) {
    const real = [word(2 * c, 2 * r), word(2 * c + 1, 2 * r), word(2 * c, 2 * r + 1), word(2 * c + 1, 2 * r + 1)];
    let ok = false;
    const tries = [0, 1, 2, 3].map((v) => cellTiles(data.tables, grid, r, c, L.floorPattern, L.wallPattern, v));
    for (const t of tries) if (t.every((w, k) => w === real[k])) ok = true;
    if (!ok) {
      bad++;
      if (bad < 15) console.log(`r${r} c${c} code ${grid[r * 32 + c].toString(16)} real ${real.map((w) => w.toString(16))} ours ${tries[0].map((w) => w.toString(16))}`);
    } else if (tries[0].some((w, k) => w !== real[k])) floorVar++;
  }
}
console.log(`mismatched cells: ${bad} / 1024 (floor variants used: ${floorVar})`);
