// Exercise the rules: keys, doors, combat, potions and exits.
const g = game, log = {};
tap('Enter'); advance(30);
const p = g.players[0];
const find = (code) => { for (let i = 32; i < 1024; i++) if (g.maze.grid[i] === code) return i; return -1; };
const standLeftOf = (i) => { p.x = ((i & 31) - 1) * 32 + 16; p.y = (i >> 5) * 32 + 28; };
const walk = (key, n) => { K(key, true); advance(n); K(key, false); advance(1); };

// key: stand left of the first key with a free cell and walk right
g.monsters = [];
for (let i = 32; i < 1024; i++) {
  if (g.maze.grid[i] === 0x35 && g.maze.grid[i - 1] === 0) { standLeftOf(i); break; }
}
walk('KeyD', 20);
log.keysAfterPickup = p.keys;

// door: the first horizontal door with floor below it; walk up into it
const d = (() => { for (let i = 32; i < 992; i++) if (g.maze.grid[i] === 3 && g.maze.grid[i + 32] === 0) return i; return -1; })();
log.door = d;
if (d >= 0) {
  p.x = (d & 31) * 32 + 16; p.y = ((d >> 5) + 1) * 32 + 30;
  p.keys = 1;
  walk('KeyW', 40);
  advance(60);
  log.doorCellAfter = g.maze.grid[d];
  log.keysAfterDoor = p.keys;
  await shot('door-opened');
}

// combat: put the contestant in a generator room and fire at whatever comes
g.loadLevel(9);
advance(20);
const h0 = p.health;
for (let k = 0; k < 8; k++) {
  const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  K(dirs[k % 4], true); advance(60); K(dirs[k % 4], false);
}
log.combat = { score: p.score, healthLost: h0 - p.health, monsters: g.monsters.length, gens: g.generators.length };
await shot('combat');

// potion
p.potions = 1;
const before = g.monsters.length;
tap('Space');
advance(5);
await shot('potion');
advance(30);
log.potion = { before, after: g.monsters.length, potions: p.potions };

// exit
const e = find(6);
p.x = (e & 31) * 32 + 16; p.y = (e >> 5) * 32 + 64;
const startLevel = g.level;
walk('KeyW', 30);
log.state = g.state;
advance(120);
log.exit = { from: startLevel, to: g.level, state: g.state };
await shot('next-level');
return log;
