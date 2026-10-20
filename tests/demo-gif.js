// A bot plays level 1 for the README GIF: shoots the nearest monster, collects things.
// npx tsx tools/play.ts tests/demo-gif.js, then tools/gif.sh
const g = game;
tap('Enter');
advance(90);
const p = g.players[0];
const wd = (d) => {
  d %= 1024;
  if (d > 512) d -= 1024;
  if (d < -512) d += 1024;
  return d;
};
const keys = { u: 'KeyW', d: 'KeyS', l: 'KeyA', r: 'KeyD' };
const fire = { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight' };
const held = new Set();
const set = (want) => {
  for (const k of [...held]) if (!want.has(k)) { K(k, false); held.delete(k); }
  for (const k of want) if (!held.has(k)) { K(k, true); held.add(k); }
};
const dirKeys = (dx, dy, map) => {
  const s = new Set();
  if (dx > 8) s.add(map.r);
  if (dx < -8) s.add(map.l);
  if (dy > 8) s.add(map.d);
  if (dy < -8) s.add(map.u);
  return s;
};
const WANT = [0x28, 0x35, 0x2b, 0x2a];
let frame = 0;
for (let t = 0; t < 600; t++) {
  let best = null, bd = 1e9;
  for (const m of g.monsters) {
    const d = Math.hypot(wd(m.x - p.x), wd(m.y - p.y));
    if (d < bd) { bd = d; best = m; }
  }
  const want = new Set();
  if (best && bd < 260) for (const k of dirKeys(wd(best.x - p.x), wd(best.y - p.y), fire)) want.add(k);
  let gi = null, gd = 1e9;
  for (let i = 32; i < 1024; i++) {
    if (!WANT.includes(g.maze.grid[i])) continue;
    const d = Math.hypot(wd((i & 31) * 32 + 16 - p.x), wd((i >> 5) * 32 + 28 - p.y));
    if (d < gd) { gd = d; gi = i; }
  }
  if (best && bd < 70) for (const k of dirKeys(-wd(best.x - p.x), -wd(best.y - p.y), keys)) want.add(k);
  else if (gi !== null && t % 90 < 70) for (const k of dirKeys(wd((gi & 31) * 32 + 16 - p.x), wd((gi >> 5) * 32 + 28 - p.y), keys)) want.add(k);
  set(want);
  advance(1);
  if (t % 3 === 0) await shot('gif/f' + String(frame++).padStart(4, '0'));
}
set(new Set());
return { frames: frame, score: p.score, health: p.health };
