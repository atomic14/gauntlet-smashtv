import './style.css';
import { loadAssets } from './assets';
import { initGfx, W, H, ctx } from './gfx';
import { input } from './input';
import { audio } from './audio';
import { Game } from './game/game';
import { DT } from './game/world';
import { Filter } from './filter';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
initGfx(canvas);
const filter = new Filter(canvas);

/** Scale the screen to fit; in portrait leave room underneath for the thumbsticks. */
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const portrait = vh > vw;
  const touch = document.body.classList.contains('touch');
  const availH = portrait && touch ? vh * 0.55 : vh;
  const scale = Math.min(vw / W, availH / H);
  const s = scale >= 2 ? Math.floor(scale) : scale;
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
  const app = document.getElementById('app')!;
  app.style.justifyContent = portrait && touch ? 'flex-start' : 'center';
  app.style.paddingTop = portrait ? `max(env(safe-area-inset-top), ${Math.round(vh * 0.06)}px)` : '0';
  filter.fit();
}
addEventListener('resize', layout);
new MutationObserver(layout).observe(document.body, { attributes: true, attributeFilter: ['class'] });
layout();

async function boot() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  input.init();
  void audio.init();
  await loadAssets();
  const game = new Game();
  // test hooks: tools/play.ts drives the game a tick at a time
  const w = window as unknown as { game: Game; filter: Filter; advance: (n: number) => void };
  w.game = game;
  w.filter = filter;
  w.advance = (n: number) => {
    for (let i = 0; i < n; i++) {
      input.poll();
      game.update();
    }
    game.draw();
    filter.render();
  };

  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      input.poll();
      game.update();
      acc -= DT;
    }
    game.draw();
    filter.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // the CRT display: F or the CRT button switches it; on to start with, and remembered
  const btn = document.getElementById('btn-crt')!;
  const applied = (say: boolean) => {
    btn.classList.toggle('on', filter.mode > 0);
    try {
      localStorage.setItem('gauntlet-smashtv.filter', filter.name);
    } catch {
      // not remembered, then
    }
    if (say) game.toast(filter.modes.length > 1 ? `DISPLAY: ${filter.name}` : 'CRT NOT AVAILABLE');
  };
  const toggleFilter = () => {
    filter.cycle();
    applied(true);
  };
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('gauntlet-smashtv.filter');
  } catch {
    // private window or storage blocked
  }
  filter.setMode(saved ?? 'CRT');
  applied(false);
  btn.addEventListener('touchstart', (e) => {
    toggleFilter();
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  btn.addEventListener('click', toggleFilter);

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') audio.toggleMute();
    if (e.code === 'KeyF' && !e.repeat) toggleFilter();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'play') game.paused = true;
  });
}

boot().catch((err) => {
  console.error(err);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f44';
  ctx.font = '12px monospace';
  ctx.fillText(String(err.message ?? err), 8, 20);
  ctx.fillText('Run: npm run extract -- /path/to/gauntlet.zip', 8, 38);
});
