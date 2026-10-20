// Title, start, walk and shoot around level 1, then jump through a few levels.
advance(30);
await shot('title');
tap('Enter');
advance(120);
await shot('level1');
const g = game;
// walk right and fire right for a while
K('KeyD', true); K('ArrowRight', true);
advance(90);
K('KeyD', false); K('ArrowRight', false);
await shot('level1-walk');
const out = { level: g.level, monsters: g.monsters.length, gens: g.generators.length, health: g.players[0].health, score: g.players[0].score, pos: [g.players[0].x|0, g.players[0].y|0] };
for (const lv of [2, 9, 13, 27]) {
  g.loadLevel(lv);
  advance(60);
  await shot('level' + lv);
}
return out;
