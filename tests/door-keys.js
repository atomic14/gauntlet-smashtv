// One key opens one whole door, however you touch it: here the contestant meets level 3's
// three-cell door straddling two of its cells, holding two keys, and should keep one.
const g = game;
tap('Enter');
advance(90);
g.loadLevel(3);
advance(10);
g.monsters.length = 0;
g.generators.length = 0;
const p = g.players[0];
p.shieldT = 999;
p.keys = 2;
// feet on the line between rows 29 and 30, just left of the door at column 28
p.x = 26 * 32 + 16; p.y = 30 * 32 + 6;
advance(2);
K('KeyD', true);
advance(40);
K('KeyD', false);
advance(60);
const door = [29, 30, 31].map((r) => g.maze.grid[r * 32 + 28]);
return { keys: p.keys, door, row: (p.y - 8) / 32 };
