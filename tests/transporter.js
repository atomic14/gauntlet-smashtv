// Level 8's transporter at (18,26) is walled in: landing on it, then pushing the stick,
// must carry on to another transporter (and not straight back to where we came from).
// npx tsx tools/play.ts tests/transporter.js
const g = game;
tap('Enter');
advance(90);
g.loadLevel(8);
advance(200);
g.monsters.length = 0;
g.generators.length = 0;
const p = g.players[0];
p.shieldT = 99;
const cell = (p) => [Math.floor(p.x / 32), Math.floor((p.y - 8) / 32)];
const ts = [];
for (let i = 0; i < 1024; i++) if (g.maze.grid[i] === 0x3b) ts.push([i & 31, i >> 5]);
// walk onto another transporter whose nearest is the boxed one: place the player on each
const log = { transporters: ts, trips: [] };
for (const [c, r] of ts) {
  if (c === 18 && r === 26) continue;
  p.arrivedOn = p.cameFrom = -1;
  p.x = c * 32 + 16;
  p.y = r * 32 + 24;
  advance(2);
  const landed = cell(p);
  advance(60); // standing still: stay put
  const idle = cell(p);
  K('KeyD', true);
  advance(180); // held: one trip at most, no chaining
  K('KeyD', false);
  log.trips.push({ from: [c, r], landed, idle, afterPush: cell(p) });
}
await shot('transporter');
return log;
