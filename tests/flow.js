// Busiest maze performance, then death -> continue -> game over -> title.
const g = game; const log = {};
tap('Enter'); advance(10);
g.loadLevel(Number(new URLSearchParams(location.search).get('lv') || 21));
const p = g.players[0];
const t0 = performance.now();
for (let i = 0; i < 600; i++) { K(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'][(i / 60 | 0) % 4], true); advance(1); K(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'][(i / 60 | 0) % 4], false); }
log.msPerTick = (performance.now() - t0) / 600;
log.monsters = g.monsters.length;
const t1 = performance.now(); for (let i = 0; i < 30; i++) g.draw(); log.msPerDraw = (performance.now() - t1) / 30;
await shot('busy');
log.beforeDeath = { state: g.state, health: p.health, dying: p.dying, exitT: p.exitT, level: g.level };
p.dying = 0; p.shieldT = 0; p.health = 1; p.hurt(g, 5);
advance(110);
log.afterDeath = g.state;
await shot('continue');
tap('Enter'); advance(5);
log.afterContinue = { state: g.state, health: p.health };
p.shieldT = 0; p.health = 1; p.hurt(g, 5); advance(110);
advance(60 * 12);
log.afterTimeout = g.state;
await shot('gameover');
advance(60 * 5);
log.end = g.state;
return log;
