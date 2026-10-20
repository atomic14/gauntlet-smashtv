const g = game;
tap('Enter'); advance(10);
for (const [lv, c, r] of [[27, 8, 4], [1, 20, 21], [3, 10, 10]]) {
  g.loadLevel(lv);
  // find a door cell and stand nearby
  let found = null;
  for (let i = 0; i < 1024; i++) if (g.maze.grid[i] === 3 || g.maze.grid[i] === 4) { found = i; if (Math.random() < 0.02) break; }
  if (found !== null) { g.players[0].x = (found & 31) * 32 + 16; g.players[0].y = (found >> 5) * 32 + 60; }
  g.monsters = [];
  advance(60);
  await shot('doors' + lv);
}
