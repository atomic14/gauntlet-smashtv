// The game: Gauntlet's mazes and rules, hosted by Smash T.V.
import { assets } from '../assets';
import { ctx, W, H, drawAt, drawObj, drawTextColor, fillRect } from '../gfx';
import { audio, SND } from '../audio';
import { input } from '../input';
import { C, isWallCode } from './playfield';
import { Maze, monsterAt, generatorAt, isDoor, isExit } from './maze';
import { Player, Monster, Generator, Shot, Lob, Effect, Floater, START_HEALTH, type Drawable } from './actors';
import { DT, CELL, VIEW_W, VIEW_H, wrap, wrapd, rand, pick } from './world';

type State = 'title' | 'play' | 'exit' | 'continue' | 'gameover';

/** Smash T.V. power-ups standing in for Gauntlet's special potions (2-4 per maze, random). */
const POWERUPS = [
  { code: 0x2f, icon: 'pu.shield', name: 'SHIELD' },
  { code: 0x30, icon: 'pu.rocket', name: 'ROCKETS' },
  { code: 0x31, icon: 'pu.spread', name: 'SPREAD GUN' },
  { code: 0x32, icon: 'pu.blades', name: 'BLADES' },
  { code: 0x33, icon: 'pu.speed', name: 'SPEED' },
] as const;

const MAZES = 114;

export class Game {
  state: State = 'title';
  stateT = 0;
  paused = false;
  maze!: Maze;
  /** The level counter (keeps going up); the maze comes from mazeFor(). */
  level = 1;
  players: Player[] = [];
  monsters: Monster[] = [];
  generators: Generator[] = [];
  shots: Shot[] = [];
  lobs: Lob[] = [];
  effects: (Effect | Floater)[] = [];
  camX = 0;
  camY = 0;
  shake = 0;
  flash = 0;
  banner = '';
  bannerT = 0;
  /** A short message at the foot of the view (e.g. the display mode), in any state. */
  private toastText = '';
  private toastT = 0;
  private timers: { t: number; fn: () => void }[] = [];
  /** Door cells already unlocked and clearing away, so touching them doesn't use another key. */
  private opening = new Set<number>();
  private hash = new Map<number, Monster[]>();
  private titleMaze: Maze;
  private continueN = 0;

  constructor() {
    this.titleMaze = new Maze(assets.gauntlet.levels[0]);
    this.enterTitle();
  }

  // ---- flow ---------------------------------------------------------------------------

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  after(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  enterTitle() {
    this.setState('title');
    this.maze = this.titleMaze;
    this.monsters = [];
    this.generators = [];
    this.shots = [];
    this.lobs = [];
    this.effects = [];
    this.timers = [];
    audio.playMusic(null);
  }

  startGame() {
    this.players = [new Player(1)];
    this.level = 1;
    audio.play(SND.contestant1);
    this.loadLevel(1);
    this.after(1.6, () => audio.play(SND.goodLuck));
    this.after(2.5, () => audio.play(SND.needIt));
  }

  mazeFor(level: number) {
    // after the last maze, Gauntlet keeps going through the later ones
    return level <= MAZES ? level : 8 + ((level - 8) % (MAZES - 7));
  }

  loadLevel(level: number) {
    this.level = level;
    const maze = new Maze(assets.gauntlet.levels[this.mazeFor(level) - 1]);
    this.maze = maze;
    this.opening.clear();
    this.monsters = [];
    this.generators = [];
    this.shots = [];
    this.lobs = [];
    this.effects = [];
    let start = { col: 2, row: 2 };
    const floors: number[] = [];
    for (let i = 0; i < 1024; i++) {
      const code = maze.grid[i], col = i & 31, row = i >> 5;
      const m = monsterAt(code);
      const gen = generatorAt(code);
      if (m) {
        this.monsters.push(new Monster(m.kind, m.level, col * CELL + CELL / 2, row * CELL + CELL - 4));
        maze.grid[i] = C.FLOOR;
      } else if (gen) {
        this.generators.push(new Generator(gen.kind as Exclude<typeof gen.kind, 'death'>, gen.level, col, row));
        maze.blocked[i] = 1;
        maze.grid[i] = C.FLOOR;
      } else if (code === C.START) {
        start = { col, row };
        maze.grid[i] = C.FLOOR;
      } else if (code === C.FLOOR && row > 0) {
        floors.push(i);
      }
    }
    // Gauntlet hides special potions in later levels; here they're Smash T.V. power-ups
    const n = level >= 10 ? 4 : level >= 5 ? 3 : 2;
    for (let k = 0; k < n && floors.length; k++) {
      const [i] = floors.splice(Math.floor(Math.random() * floors.length), 1);
      maze.grid[i] = pick(POWERUPS).code;
    }
    for (const p of this.players) {
      p.x = start.col * CELL + CELL / 2;
      p.y = start.row * CELL + CELL - 4;
      p.exitT = 0;
      p.arrivedOn = p.cameFrom = -1;
      p.moveDir = p.aimDir = 4;
    }
    this.snapCamera();
    this.setState('play');
    this.banner = `LEVEL ${level}`;
    this.bannerT = 2.2;
    audio.playMusic('03');
    if (level > 1) this.after(0.4, () => audio.play(pick([SND.letsGo, SND.go, SND.goodLuck])));
  }

  playerDied(_p: Player) {
    if (this.players.some((p) => p.alive)) return;
    this.setState('continue');
    this.continueN = 10;
    audio.playMusic(null);
    audio.play(SND.noWay);
    this.after(127 / 54.71, () => this.state === 'continue' && audio.play(SND.continueSting));
  }

  private exitLevel(p: Player, code: number) {
    if (this.state !== 'play') return;
    p.exitT = 0.001;
    this.setState('exit');
    audio.play(SND.applause);
    this.after(0.5, () => audio.play(pick([SND.loveIt, SND.yeah, SND.woo, SND.carnage])));
    const next = code === C.EXIT4 ? 4 : code === C.EXIT8 ? 8 : this.level + 1;
    this.after(1.6, () => this.loadLevel(next));
  }

  // ---- update -----------------------------------------------------------------------------

  toast(text: string) {
    this.toastText = text;
    this.toastT = 1.5;
  }

  update() {
    this.toastT = Math.max(0, this.toastT - DT);
    if (input.pause && (this.state === 'play' || this.state === 'exit')) this.paused = !this.paused;
    if (this.paused) {
      if (input.start) this.paused = false;
      return;
    }
    this.stateT += DT;
    for (const t of this.timers) t.t -= DT;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();
    this.shake = Math.max(0, this.shake - DT);
    this.flash = Math.max(0, this.flash - DT);
    this.bannerT = Math.max(0, this.bannerT - DT);

    switch (this.state) {
      case 'title':
        this.camX = wrap(this.camX + 18 * DT);
        this.camY = wrap(this.camY + 11 * DT);
        if (input.start) this.startGame();
        return;
      case 'continue':
        if (this.stateT >= 1) {
          this.stateT -= 1;
          this.continueN--;
          // the original's continue screen is silent after its sting (MAME sound log)
          if (this.continueN < 0) {
            this.setState('gameover');
            audio.playMusic('0d');
          }
        }
        if (input.start && this.continueN >= 0) {
          // a coin buys another 700 health, as in the arcade
          for (const p of this.players) {
            p.health = START_HEALTH;
            p.dying = 0;
            // a moment's grace to get clear of whatever got you
            p.shieldT = 2.5;
          }
          audio.play(SND.contestant1);
          this.setState('play');
          audio.playMusic('03');
        }
        return;
      case 'gameover':
        if (this.stateT > 4 || (this.stateT > 1 && input.start)) this.enterTitle();
        return;
      case 'exit':
        for (const p of this.players) if (p.exitT > 0) p.exitT += DT;
        this.updateWorld(false);
        return;
      case 'play':
        this.updateWorld(true);
    }
  }

  private updateWorld(live: boolean) {
    if (live) for (const p of this.players) p.update(this);
    this.rebuildHash();
    for (const m of this.monsters) m.update(this);
    for (const gen of this.generators) gen.update(this);
    for (const s of this.shots) s.update(this);
    for (const l of this.lobs) l.update(this);
    for (const e of this.effects) e.update();
    this.monsters = this.monsters.filter((m) => !m.dead);
    this.generators = this.generators.filter((x) => !x.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    this.lobs = this.lobs.filter((s) => !s.dead);
    this.effects = this.effects.filter((e) => !e.dead);
    this.followCamera();
  }

  private rebuildHash() {
    this.hash.clear();
    for (const m of this.monsters) {
      const k = (Math.floor(m.y / CELL) & 31) * 32 + (Math.floor(m.x / CELL) & 31);
      const l = this.hash.get(k);
      if (l) l.push(m);
      else this.hash.set(k, [m]);
    }
  }

  /** The monster whose body is within r (+ its own size) of (x, y), if any. */
  monsterAt(x: number, y: number, r: number, except?: Monster): Monster | null {
    const c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL);
    let best: Monster | null = null, bd = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const l = this.hash.get(((r0 + dr) & 31) * 32 + ((c0 + dc) & 31));
        if (!l) continue;
        for (const m of l) {
          if (m === except || m.dead) continue;
          const d = Math.hypot(wrapd(m.x - x), wrapd(m.y - y));
          if (d < r + m.hw && d < bd) {
            best = m;
            bd = d;
          }
        }
      }
    }
    return best;
  }

  blockedForMonster(m: Monster, x: number, y: number) {
    // monsters queue up behind each other, as in Gauntlet (ghosts and Death float through)
    const other = m.kind === 'death' ? null : this.monsterAt(x, y, 8, m);
    // only block a move that takes it closer to the other monster, so crowds can unpick
    if (other && Math.hypot(wrapd(other.x - x), wrapd(other.y - y)) < Math.hypot(wrapd(other.x - m.x), wrapd(other.y - m.y))) return true;
    return this.playerNear(x, y, 18);
  }

  nearestPlayer(x: number, y: number): Player | null {
    let best: Player | null = null, bd = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.hypot(wrapd(p.x - x), wrapd(p.y - y));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  playerNear(x: number, y: number, r: number) {
    return this.players.some((p) => p.alive && Math.hypot(wrapd(p.x - x), wrapd(p.y - y)) < r);
  }

  // ---- the maze's contents ------------------------------------------------------------------

  /** Pick-ups, doors, exits, traps and transporters under or against a contestant. */
  touchCells(p: Player) {
    const m = this.maze;
    // doors open when a contestant with a key walks into them
    if (p.keys > 0) {
      const c0 = Math.floor((p.x - p.hw - 3) / CELL), c1 = Math.floor((p.x + p.hw + 3) / CELL);
      const r0 = Math.floor((p.y - p.hh - 3) / CELL), r1 = Math.floor((p.y + 2) / CELL);
      outer: for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (isDoor(m.get(c, r)) && !this.opening.has((r & 31) * 32 + (c & 31))) {
            p.keys--;
            this.openDoor(c & 31, r & 31);
            break outer;
          }
        }
      }
    }
    const cx = p.x, cy = p.y - 8;
    const col = Math.floor(cx / CELL), row = Math.floor(cy / CELL);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = (col + dc) & 31, r = (row + dr) & 31;
        const ccx = c * CELL + CELL / 2, ccy = r * CELL + CELL / 2;
        const d = Math.hypot(wrapd(ccx - cx), wrapd(ccy - cy));
        const code = m.get(c, r);
        if (isExit(code) && d < 14) return this.exitLevel(p, code);
        if (code === C.TRANSPORTER) {
          const here = r * 32 + c;
          if (d > 24 && p.arrivedOn === here) p.arrivedOn = -1;
          // a fresh push of the stick on the one we landed on goes on again: the way out
          // of one that's walled in
          const again = p.arrivedOn === here && p.releasedSinceArrival && Math.hypot(input.move.x, input.move.y) > 0.3;
          if (d < 12 && (p.arrivedOn !== here || again)) return this.transport(p, c, r);
          continue;
        }
        if (d < 20) this.pickup(p, c, r, code);
      }
    }
  }

  private pickup(p: Player, c: number, r: number, code: number) {
    const m = this.maze;
    const x = c * CELL + CELL / 2, y = r * CELL;
    const take = () => m.set(c, r, C.FLOOR);
    switch (code) {
      case C.TREASURE:
        take();
        this.addScore(p, 100, x, y);
        audio.play(pick([SND.bigMoney, SND.bigMoney, SND.buyThat]));
        break;
      case C.MONEYBAG:
        take();
        this.addScore(p, 500, x, y);
        audio.play(SND.bigMoney);
        break;
      case C.CIDER:
      case C.FOOD:
        take();
        m.food.delete(r * 32 + c);
        p.health += 100;
        this.effects.push(new Floater(x, y, '+100 HEALTH', '#8f8'));
        audio.play(pick([SND.buyThat, SND.yeah, SND.good]));
        break;
      case C.POTION:
      case C.POTION2:
        take();
        p.potions = Math.min(p.potions + 1, 12);
        audio.play(SND.bigPrizes);
        break;
      case C.KEY:
        take();
        p.keys = Math.min(p.keys + 1, 12);
        this.addScore(p, 100, x, y);
        audio.play(SND.bingo);
        break;
      case C.AMULET:
        // the amulet: monsters lose sight of you for a while
        take();
        p.invisT = 15;
        this.effects.push(new Floater(x, y, 'INVISIBILITY', '#adf'));
        audio.play(SND.prize);
        break;
      case C.TRAP:
        // stepping on a trap removes the trap walls
        take();
        for (let i = 0; i < 1024; i++) if (m.grid[i] === C.WALL_TRAP) m.set(i & 31, i >> 5, C.FLOOR);
        audio.play(SND.door);
        break;
      default: {
        const pu = POWERUPS.find((u) => u.code === code);
        if (!pu) return;
        take();
        audio.play(SND.prize);
        this.effects.push(new Floater(x, y, pu.name, '#ff8'));
        if (code === 0x2f) p.shieldT = 30;
        else if (code === 0x30) [p.weapon, p.weaponT] = ['rocket', 30];
        else if (code === 0x31) [p.weapon, p.weaponT] = ['spread', 30];
        else if (code === 0x32) p.bladesT = 30;
        else if (code === 0x33) p.speedT = 30;
      }
    }
  }

  /** Doors open as a whole, piece by piece from the one touched (0x4388c). */
  private openDoor(col: number, row: number) {
    audio.play(SND.door);
    const seen = new Set<number>();
    let ring = [[col, row]];
    let delay = 0;
    while (ring.length) {
      const next: number[][] = [];
      const cells = ring;
      this.after(delay, () => {
        for (const [c, r] of cells) {
          this.opening.delete(r * 32 + c);
          if (isDoor(this.maze.get(c, r))) this.maze.set(c, r, C.FLOOR);
        }
      });
      for (const [c, r] of ring) {
        seen.add(r * 32 + c);
        this.opening.add(r * 32 + c);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = (c + dc) & 31, nr = (r + dr) & 31;
          if (!seen.has(nr * 32 + nc) && isDoor(this.maze.get(nc, nr))) {
            seen.add(nr * 32 + nc);
            next.push([nc, nr]);
          }
        }
      }
      ring = next;
      delay += 0.04;
    }
  }

  /** Transporters take you to the nearest other transporter. */
  private transport(p: Player, col: number, row: number) {
    let best = -1, bd = Infinity;
    let count = 0;
    for (let i = 0; i < 1024; i++) if (this.maze.grid[i] === C.TRANSPORTER) count++;
    for (let i = 0; i < 1024; i++) {
      if (this.maze.grid[i] !== C.TRANSPORTER || i === row * 32 + col) continue;
      if (i === p.cameFrom && count > 2) continue;
      const d = Math.hypot(wrapd((i & 31) - col), wrapd((i >> 5) - row));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return;
    this.effect('puff', p.x, p.y, 16);
    p.x = (best & 31) * CELL + CELL / 2;
    p.y = (best >> 5) * CELL + CELL - 8;
    p.cameFrom = row * 32 + col;
    p.arrivedOn = best;
    p.releasedSinceArrival = false;
    // landing on a monster destroys it
    for (const m of this.monsters) if (Math.hypot(wrapd(m.x - p.x), wrapd(m.y - p.y)) < 24 && m.kind !== 'death') m.kill(this, p);
    this.effect('puff', p.x, p.y, 16);
    audio.play(SND.rocket);
  }

  /** A player's shot entering a cell; returns true if it stops there. */
  shotCell(col: number, row: number, s: Shot): boolean {
    const m = this.maze;
    col &= 31;
    row &= 31;
    const i = row * 32 + col;
    const code = m.grid[i];
    if (m.blocked[i]) {
      const gen = this.generators.find((x) => x.col === col && x.row === row);
      gen?.hit(this, s.dmg, s.owner);
      return true;
    }
    if (row === 0 || code === C.WALL || code === C.WALL_TRAP || isDoor(code)) return true;
    if (code >= C.WALL_HIT2 && code <= C.WALL_BREAK) {
      // destructible walls crumble a stage per hit
      m.set(col, row, code === C.WALL_HIT2 ? C.FLOOR : code - 1);
      audio.play(SND.hit, { overlap: true, volume: 0.5 });
      if (code === C.WALL_HIT2) this.addScore(s.owner, 10, col * CELL + 16, row * CELL);
      return true;
    }
    if (code === C.CIDER || code === C.FOOD) {
      // "Warrior shot the food!"
      m.set(col, row, C.FLOOR);
      m.food.delete(i);
      this.effect('boom', col * CELL + 16, row * CELL + 24, 16);
      audio.play(SND.noWay);
      return true;
    }
    if (code === C.POTION) {
      // a shot potion goes off, with less effect
      m.set(col, row, C.FLOOR);
      this.magicBlast(col * CELL + 16, row * CELL + 16, 140, s.owner);
      return true;
    }
    return false;
  }

  // ---- combat helpers -----------------------------------------------------------------------

  useMagic(p: Player) {
    if (p.potions <= 0) return;
    p.potions--;
    this.magicBlast(p.x, p.y, Infinity, p);
    audio.play(SND.carnage);
    this.after(1.1, () => audio.play(SND.loveIt));
  }

  /** A potion: everything on screen (or within `radius`) is hit hard; Death included. */
  private magicBlast(x: number, y: number, radius: number, by: Player | null) {
    this.flash = 0.25;
    this.shake = 0.4;
    audio.play(SND.explode, { overlap: true });
    const near = (ox: number, oy: number) => {
      const dx = wrapd(ox - x), dy = wrapd(oy - y);
      return radius === Infinity ? Math.abs(dx) < VIEW_W / 2 + 16 && Math.abs(dy) < VIEW_H / 2 + 16 : Math.hypot(dx, dy) < radius;
    };
    for (const m of this.monsters) {
      if (m.dead || !near(m.x, m.y)) continue;
      m.kill(this, by);
      this.effect('boom', m.x + rand(-6, 6), m.y - rand(4, 16), rand(12, 20));
    }
    for (const gen of this.generators) if (!gen.dead && near(gen.x, gen.y)) gen.hit(this, 1, by);
  }

  /** A rocket's explosion. */
  blast(x: number, y: number, r: number, dmg: number, by: Player | null) {
    this.effect('puff', x, y + 8, 18);
    audio.play(SND.explode, { overlap: true, volume: 0.6 });
    for (const m of this.monsters) if (!m.dead && m.shootable && Math.hypot(wrapd(m.x - x), wrapd(m.y - 12 - y)) < r) m.hit(this, dmg, by);
    for (const gen of this.generators) if (!gen.dead && Math.hypot(wrapd(gen.x - x), wrapd(gen.y - 16 - y)) < r) gen.hit(this, 1, by);
  }

  addScore(by: Player | null, n: number, x: number, y: number) {
    const p = by ?? this.players[0];
    if (p) p.score += n;
    this.effects.push(new Floater(x, y, String(n)));
  }

  effect(name: string, x: number, y: number, fps = 15) {
    this.effects.push(new Effect(name, x, y, fps));
  }

  // ---- camera -------------------------------------------------------------------------

  private focus() {
    const p = this.players.find((q) => q.alive) ?? this.players[0];
    return p ? { x: p.x, y: p.y - 16 } : { x: this.camX, y: this.camY };
  }

  private snapCamera() {
    const f = this.focus();
    this.camX = f.x;
    this.camY = f.y;
  }

  private followCamera() {
    const f = this.focus();
    this.camX = wrap(this.camX + wrapd(f.x - this.camX) * 0.25);
    this.camY = wrap(this.camY + wrapd(f.y - this.camY) * 0.25);
  }

  // ---- drawing --------------------------------------------------------------------------------

  /** Screen position of a world point (null if well off screen). */
  private toScreen(x: number, y: number, ox: number, oy: number, margin = 64) {
    const sx = VIEW_W / 2 + wrapd(x - this.camX) + ox, sy = VIEW_H / 2 + wrapd(y - this.camY) + oy;
    if (sx < -margin || sx > VIEW_W + margin || sy < -margin || sy > VIEW_H + margin) return null;
    return { sx, sy };
  }

  drawLabel(text: string, sx: number, sy: number, color: string, alpha = 1) {
    ctx.globalAlpha = Math.max(0, alpha);
    drawTextColor(text, sx, sy, color, 'small', 'center');
    ctx.globalAlpha = 1;
  }

  draw() {
    const ox = this.shake > 0 ? rand(-3, 3) : 0, oy = this.shake > 0 ? rand(-3, 3) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();
    this.maze.draw(ctx, this.camX - VIEW_W / 2 - ox, this.camY - VIEW_H / 2 - oy, VIEW_W, VIEW_H);
    this.drawCells(ox, oy);
    const list: { d: Drawable; sx: number; sy: number; z: number }[] = [];
    const add = (d: Drawable, z = 0) => {
      const s = this.toScreen(d.x, d.y, ox, oy);
      if (s) list.push({ d, sx: s.sx, sy: s.sy, z });
    };
    for (const gen of this.generators) add(gen, -1);
    for (const m of this.monsters) add(m);
    if (this.state !== 'title') for (const p of this.players) add(p);
    list.sort((a, b) => a.z - b.z || a.sy - b.sy);
    for (const { d, sx, sy } of list) d.draw(this, sx, sy);
    for (const s of [...this.shots, ...this.lobs, ...this.effects]) {
      const p = this.toScreen(s.x, s.y, ox, oy);
      if (p) s.draw(this, p.sx, p.sy);
    }
    if (this.flash > 0) fillRect(0, 0, VIEW_W, VIEW_H, `rgba(255,255,255,${(this.flash / 0.25) * 0.7})`);
    if (this.state === 'title') this.drawTitle();
    else this.drawOverlays();
    if (this.toastT > 0) {
      ctx.globalAlpha = Math.min(1, this.toastT * 3);
      fillRect(VIEW_W / 2 - 90, VIEW_H - 40, 180, 22, 'rgba(0,0,0,0.7)');
      drawTextColor(this.toastText, VIEW_W / 2, VIEW_H - 34, '#fff', 'small', 'center');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.drawPanel();
  }

  /** Items, doors and power-ups in the cells on screen. */
  private drawCells(ox: number, oy: number) {
    const m = this.maze;
    const left = this.camX - VIEW_W / 2 - ox, top = this.camY - VIEW_H / 2 - oy;
    const c0 = Math.floor(left / CELL) - 1, r0 = Math.floor(top / CELL) - 1;
    for (let r = r0; r < r0 + VIEW_H / CELL + 3; r++) {
      for (let c = c0; c < c0 + VIEW_W / CELL + 3; c++) {
        const code = m.get(c, r);
        if (code === C.FLOOR || code === C.START || isWallCode(code) || isExit(code) || code === C.TRAP || code === C.TRANSPORTER) continue;
        const sx = c * CELL - left + CELL / 2, sy = r * CELL - top + CELL / 2;
        if (isDoor(code)) {
          this.drawDoor(c, r, code, sx, sy);
          continue;
        }
        const pu = POWERUPS.find((u) => u.code === code);
        if (pu) {
          drawAt(pu.icon, 0, sx, sy + 10, pu.icon);
          continue;
        }
        const name = code === C.FOOD ? m.food.get((r & 31) * 32 + (c & 31)) ?? 'food0' : code.toString(16).padStart(2, '0');
        drawObj(name, sx, sy);
      }
    }
  }

  /**
   * A door cell. Crossings and corners use 0x43e12's pieces (by which neighbours are doors);
   * straight runs use 0x43f0c / 0x44080's, picked by the walls at the run's ends.
   */
  private drawDoor(c: number, r: number, code: number, sx: number, sy: number) {
    const m = this.maze, t = assets.gauntlet.tables;
    const door = (dc: number, dr: number) => isDoor(m.get(c + dc, r + dr));
    const wall = (dc: number, dr: number) => (r + dr) % 32 === 0 || isWallCode(m.get(c + dc, r + dr)) || m.blocked[((r + dr) & 31) * 32 + ((c + dc) & 31)] === 1;
    const across = code === C.DOOR_H && !door(0, -1) && !door(0, 1);
    const down = code === C.DOOR_V && !door(-1, 0) && !door(1, 0);
    if (!across && !down) {
      const mask = (door(0, -1) ? 1 : 0) | (door(1, 0) ? 2 : 0) | (door(0, 1) ? 4 : 0) | (door(-1, 0) ? 8 : 0);
      drawObj(`door.${t.door[mask].toString(16)}`, sx, sy);
      return;
    }
    // the end towards -1 (left/up) and +1 (right/down): open, a thick wall, or a thin one
    const end = (k: number) => {
      const [dx, dy] = across ? [k, 0] : [0, k];
      if (!wall(dx, dy)) return 'open';
      if (!wall(2 * dx, 2 * dy)) return 'wall';
      const [px, py] = across ? [0, 1] : [1, 0];
      return wall(dx - px, dy - py) || wall(dx + px, dy + py) ? 'wall' : 'thin';
    };
    const a = end(-1), b = end(1);
    const i = (a === 'open' ? 6 : a === 'thin' ? 3 : 0) + (b === 'open' ? 2 : b === 'thin' ? 1 : 0);
    const piece = (across ? t.doorH : t.doorV)[i];
    const f = assets.gauntlet.objFrames[piece.name];
    if (!f) return;
    const [, , w, h] = f;
    // pieces reach into the walls they meet; place by their top-left corner
    const left = across ? sx - CELL / 2 - piece.xoff * 2 : sx - CELL / 2;
    const top = across ? sy - CELL / 2 : sy - CELL / 2 - 8 + piece.xoff * 2;
    drawObj(piece.name, left + w, top + h);
  }

  private drawOverlays() {
    if (this.bannerT > 0 && this.state === 'play') {
      const a = Math.min(1, this.bannerT * 2);
      ctx.globalAlpha = a;
      fillRect(0, VIEW_H / 2 - 40, VIEW_W, 34, 'rgba(0,0,0,0.55)');
      drawTextColor(this.banner, VIEW_W / 2, VIEW_H / 2 - 32, '#ffe14a', 'big', 'center');
      ctx.globalAlpha = 1;
    }
    if (this.paused) this.centerBox(['PAUSED', 'PRESS START TO CONTINUE']);
    if (this.state === 'continue') {
      this.centerBox(['NO WAY!', `CONTINUE?  ${Math.max(0, this.continueN)}`, 'PRESS START FOR 700 HEALTH']);
    }
    if (this.state === 'gameover') this.centerBox(['GAME OVER', `FINAL SCORE ${this.players[0]?.score ?? 0}`]);
  }

  private centerBox(lines: string[]) {
    const h = 26 + lines.length * 18;
    fillRect(VIEW_W / 2 - 170, VIEW_H / 2 - h / 2, 340, h, 'rgba(0,0,0,0.7)');
    lines.forEach((l, i) => drawTextColor(l, VIEW_W / 2, VIEW_H / 2 - h / 2 + 14 + i * 18, i === 0 ? '#ffe14a' : '#fff', i === 0 ? 'big' : 'small', 'center'));
  }

  private drawTitle() {
    fillRect(0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.55)');
    drawTextColor('GAUNTLET', VIEW_W / 2, 36, '#ff3b2f', 'big', 'center');
    drawTextColor('THE SMASH T.V. EDITION', VIEW_W / 2, 58, '#ffe14a', 'small', 'center');
    // the cast
    const cast: [string, string, number][] = [
      ['GRUNTS', 'grunt.d', 0],
      ['GHOSTS', 'orb', 0],
      ['DEMONS', 'spear.d', 0],
      ['LOBBERS', 'shrapnel.d', 4],
      ['SORCERERS', 'bossorb.green', 0],
      ['DEATH', 'mutoid.head', 4],
    ];
    const f = Math.floor(this.stateT * 8);
    cast.forEach(([name, a, dy], i) => {
      const x = 80 + i * 96;
      drawAt(a, f, x, 140 + dy, a);
      drawTextColor(name, x, 150, '#fff', 'small', 'center');
    });
    drawAt('legs.d', Math.floor(this.stateT * 10), VIEW_W / 2, 230, 'legs.d');
    drawAt('torso.d', 0, VIEW_W / 2, 230, 'legs.d');
    drawTextColor('CONTESTANT ONE', VIEW_W / 2, 240, '#6cf', 'small', 'center');
    if (Math.floor(this.stateT * 2) % 2 === 0) drawTextColor(input.touch ? 'TAP TO START' : 'PRESS START', VIEW_W / 2, 280, '#fff', 'big', 'center');
    const lines = input.touch
      ? ['LEFT STICK MOVES, RIGHT STICK FIRES', 'BOMB BUTTON USES A POTION']
      : ['WASD MOVE   ARROWS FIRE   SPACE POTION', 'ENTER START   P PAUSE   M MUTE', 'GAMEPAD: STICKS, SHOULDERS FOR POTIONS'];
    lines.forEach((l, i) => drawTextColor(l, VIEW_W / 2, 330 + i * 14, '#ccc', 'small', 'center'));
    drawTextColor('GAUNTLET (C)1985 ATARI GAMES   SMASH T.V. (C)1990 WILLIAMS', VIEW_W / 2, VIEW_H - 18, '#888', 'small', 'center');
  }

  private drawPanel() {
    const x0 = VIEW_W;
    fillRect(x0, 0, W - x0, H, '#101018');
    fillRect(x0, 0, 2, H, '#3a3a58');
    const cx = x0 + (W - x0) / 2;
    drawTextColor('GAUNTLET', cx, 10, '#ff3b2f', 'big', 'center');
    drawTextColor('SMASH T.V.', cx, 30, '#ffe14a', 'small', 'center');
    if (this.state === 'title') {
      drawTextColor('114 MAZES', cx, 70, '#ccc', 'small', 'center');
      drawTextColor('FROM THE', cx, 84, '#ccc', 'small', 'center');
      drawTextColor('ORIGINAL ROM', cx, 98, '#ccc', 'small', 'center');
      return;
    }
    drawTextColor(`LEVEL ${this.level}`, cx, 56, '#fff', 'big', 'center');
    const p = this.players[0];
    if (!p) return;
    drawTextColor('CONTESTANT 1', cx, 86, '#6cf', 'small', 'center');
    drawTextColor('SCORE', x0 + 10, 104, '#aaa');
    drawTextColor(String(p.score), W - 10, 104, '#fff', 'small', 'right');
    drawTextColor('HEALTH', x0 + 10, 122, '#aaa');
    const low = p.health < 200 && Math.floor(this.stateT * 4) % 2 === 0;
    drawTextColor(String(p.health), cx, 136, low ? '#ff3b2f' : '#fff', 'big', 'center');
    // keys and potions (Gauntlet's own art, at arcade size)
    drawTextColor('KEYS', x0 + 10, 166, '#aaa');
    this.drawIcons('35', p.keys, x0 + 10, 178);
    drawTextColor('POTIONS', x0 + 10, 210, '#aaa');
    this.drawIcons('2c', p.potions, x0 + 10, 222);
    let y = 262;
    const timers: [string, number][] = [
      ['pu.shield', p.shieldT],
      ['pu.rocket', p.weapon === 'rocket' ? p.weaponT : 0],
      ['pu.spread', p.weapon === 'spread' ? p.weaponT : 0],
      ['pu.blades', p.bladesT],
      ['pu.speed', p.speedT],
    ];
    for (const [icon, t] of timers) {
      if (t <= 0) continue;
      drawAt(icon, 0, x0 + 22, y + 20, icon);
      drawTextColor(String(Math.ceil(t)), x0 + 40, y + 6, '#fff');
      y += 24;
    }
    if (p.invisT > 0) {
      drawTextColor(`INVISIBLE ${Math.ceil(p.invisT)}`, cx, y + 4, '#adf', 'small', 'center');
    }
    if (this.monsters.length) drawTextColor(`${this.monsters.length} MONSTERS`, cx, H - 20, '#666', 'small', 'center');
  }

  private drawIcons(name: string, n: number, x: number, y: number) {
    const f = assets.gauntlet.objFrames[name];
    if (!f) return;
    const [sx, sy, w, h] = f;
    for (let i = 0; i < Math.min(n, 12); i++) {
      const ix = x + (i % 6) * 17, iy = y + Math.floor(i / 6) * 14 - (h - 16) / 2;
      ctx.drawImage(assets.gauntlet.objects, sx, sy, w, h, ix - (w - 16) / 2, iy, w, h);
    }
    if (n === 0) drawTextColor('-', x, y + 2, '#555');
  }
}
