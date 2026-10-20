// The CRT display is on by default, and F switches it off and on again.
// npx tsx tools/play.ts tests/crt.js
const g = game;
const log = { start: filter.name, modes: filter.modes.map((m) => m.name) };
tap('Enter');
advance(240);
await shot('crt');
tap('KeyF');
advance(1);
log.afterF = filter.name;
await shot('crt-off');
tap('KeyF');
advance(1);
log.afterF2 = filter.name;
log.state = g.state;
return log;
