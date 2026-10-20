// A bot plays level 1 for the README GIF. It only fires when it has a clear shot at a
// monster or generator lined up with one of the eight directions, and walks the maze by
// breadth-first search to the nearest treasure, key or food (through doors once it has a key).
// npx tsx tools/play.ts tests/demo-gif.js, then tools/gif.sh
const g = game;
filter.setMode('ORIGINAL'); // the plain pixels make a cleaner, smaller GIF
tap('Enter');
advance(90);
const p = g.players[0];
const m = g.maze;
const wd = (d) => {
  d %= 1024;
  if (d > 512) d -= 1024;
  if (d < -512) d += 1024;
  return d;
};
const MOVE = { u: 'KeyW', d: 'KeyS', l: 'KeyA', r: 'KeyD' };
const FIRE = { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight' };
// the eight directions as key combinations, in dir8 order (0 = up, clockwise)
const DIRS = [['u'], ['u', 'r'], ['r'], ['d', 'r'], ['d'], ['d', 'l'], ['l'], ['u', 'l']];
const held = new Set();
const set = (want) => {
  for (const k of [...held]) if (!want.has(k)) { K(k, false); held.delete(k); }
  for (const k of want) if (!held.has(k)) { K(k, true); held.add(k); }
};

// a target lined up (within 10 degrees of one of the eight directions) with nothing in the way
const aim = () => {
  const mx = p.x, my = p.y - 14;
  let best = null, bd = 300;
  const consider = (tx, ty) => {
    const dx = wd(tx - mx), dy = wd(ty - my), d = Math.hypot(dx, dy);
    if (d >= bd || d < 1) return;
    const a = Math.atan2(dx, -dy), dir = (Math.round(a / (Math.PI / 4)) + 8) % 8;
    const off = Math.abs(a - Math.round(a / (Math.PI / 4)) * (Math.PI / 4));
    if (off * d > 10 && off > 0.17) return;
    if (!m.clearLine(mx, my, dx, dy)) return;
    best = dir;
    bd = d;
  };
  for (const mo of g.monsters) if (mo.kind !== 'death') consider(mo.x, mo.y - 10);
  for (const gen of g.generators) consider(gen.x, gen.y);
  return best;
};

// the next cell towards the nearest wanted item, by breadth-first search over the maze
const WANT = new Set([0x28, 0x35, 0x2b, 0x2a, 0x2c]);
const route = () => {
  const sc = Math.floor(p.x / 32) & 31, sr = Math.floor((p.y - 8) / 32) & 31;
  const prev = new Map([[sr * 32 + sc, -1]]);
  const q = [sr * 32 + sc];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], c = k & 31, r = k >> 5;
    if (i > 0 && WANT.has(m.grid[k])) {
      let s = k;
      while (prev.get(s) !== q[0]) s = prev.get(s);
      return s;
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (((r + dr) & 31) * 32) + ((c + dc) & 31);
      if (prev.has(n)) continue;
      const code = m.grid[n];
      if (m.solidCell(n & 31, n >> 5) && !(p.keys > 0 && (code === 3 || code === 4))) continue;
      prev.set(n, k);
      q.push(n);
    }
  }
  return null;
};

let frame = 0;
for (let t = 0; t < 600; t++) {
  const want = new Set();
  const dir = aim();
  if (dir !== null) for (const k of DIRS[dir]) want.add(FIRE[k]);
  // back away from monsters that get too close, otherwise head for the next item
  let ax = 0, ay = 0;
  for (const mo of g.monsters) {
    const dx = wd(mo.x - p.x), dy = wd(mo.y - p.y), d = Math.hypot(dx, dy);
    if (d < 60 && d > 0) { ax -= dx / d; ay -= dy / d; }
  }
  const next = Math.hypot(ax, ay) > 0.5 ? null : route();
  if (next === null && Math.hypot(ax, ay) > 0.5) {
    if (ax > 0.4) want.add(MOVE.r);
    if (ax < -0.4) want.add(MOVE.l);
    if (ay > 0.4) want.add(MOVE.d);
    if (ay < -0.4) want.add(MOVE.u);
  } else if (next !== null) {
    const dx = wd((next & 31) * 32 + 16 - p.x), dy = wd((next >> 5) * 32 + 26 - p.y);
    if (dx > 3) want.add(MOVE.r);
    if (dx < -3) want.add(MOVE.l);
    if (dy > 3) want.add(MOVE.d);
    if (dy < -3) want.add(MOVE.u);
  }
  set(want);
  // the recording shouldn't end in a death: health (cropped out of the GIF) is kept topped up
  p.health = Math.max(p.health, 400);
  advance(1);
  if (t % 3 === 0) await shot('gif/f' + String(frame++).padStart(4, '0'));
}
set(new Set());
return { frames: frame, score: p.score, health: p.health, keys: p.keys, level: g.level };
