// Shots glance off Death (with a hint), and a potion kills it.
// npx tsx tools/play.ts tests/death.js
const g = game;
tap('Enter');
advance(90);
g.loadLevel(1);
advance(200);
const p = g.players[0];
// the first level with a Death in it; keep only Death, beside the player
let d = null;
for (let n = 1; n <= 114 && !d; n++) {
  g.loadLevel(n);
  d = g.monsters.find((m) => m.kind === 'death');
}
g.generators.length = 0;
g.monsters = [d];
p.shieldT = 99;
d.x = p.x + 80;
d.y = p.y;
d.drained = 0;
K('ArrowRight', true);
for (let t = 0; t < 40; t++) {
  advance(1);
  d.x = p.x + 80; d.y = p.y; // hold it in the line of fire
  if (t === 25) await shot('death-hint');
}
K('ArrowRight', false);
const hint = g.effects.some((e) => e.text === 'USE A POTION!');
const shotsPast = g.shots.filter((s) => s.x > d.x + 20).length;
const aliveAfterShots = !d.dead;
p.potions = 1;
tap('Space');
advance(10);
return { level: g.level, aliveAfterShots, hint, shotsPast, afterPotion: { dead: d.dead, score: p.score } };
