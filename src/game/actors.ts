// Everything that moves: the contestant, shots, effects, Gauntlet's monsters played by
// Smash T.V.'s cast, and the monster generators.
//
// Casting: ghosts are the floating orbs (they fly at you and burst), grunts are grunts,
// demons are the spear throwers (they shoot), lobbers are Mr. Shrapnel (lobbing shrapnel
// over the walls), sorcerers are the flickering orbs that fade in and out, and Death is
// Mutoid Man's head.
import { anim } from '../assets';
import { ctx, drawAt, drawObj } from '../gfx';
import { audio, SND } from '../audio';
import { input, dir8, DIR_VEC, DIR_NAME, type Vec } from '../input';
import { type MonsterKind } from './maze';
import { DT, CELL, wrap, wrapd, rand, clamp } from './world';
import type { Game } from './game';

export interface Drawable {
  x: number;
  y: number;
  dead: boolean;
  draw(g: Game, sx: number, sy: number): void;
}

// ---------------------------------------------------------------------------------
// Movement against the maze
// ---------------------------------------------------------------------------------

export interface Body {
  x: number;
  y: number;
  /** half width and height of the footprint box above the feet */
  hw: number;
  hh: number;
}

/** Move a body by (dx, dy), sliding along walls. Returns false if it could not move at all. */
export function moveBody(g: Game, b: Body, dx: number, dy: number, blocked?: (x: number, y: number) => boolean): boolean {
  let moved = false;
  const tryAt = (nx: number, ny: number) => g.maze.boxClear(nx - b.hw, ny - b.hh, nx + b.hw, ny) && !blocked?.(nx, ny);
  if (dx && tryAt(b.x + dx, b.y)) {
    b.x += dx;
    moved = true;
  }
  if (dy && tryAt(b.x, b.y + dy)) {
    b.y += dy;
    moved = true;
  }
  b.x = wrap(b.x);
  b.y = wrap(b.y);
  return moved;
}

// ---------------------------------------------------------------------------------
// The contestant
// ---------------------------------------------------------------------------------

export type Weapon = 'gun' | 'spread' | 'rocket';
export const START_HEALTH = 700;

export class Player implements Body, Drawable {
  x = 0;
  y = 0;
  hw = 9;
  hh = 12;
  dead = false;
  moveDir = 4;
  aimDir = 4;
  walkT = 0;
  fireCd = 0;
  fireAnim = 0;
  health = START_HEALTH;
  score = 0;
  keys = 0;
  potions = 0;
  weapon: Weapon = 'gun';
  weaponT = 0;
  shieldT = 0;
  speedT = 0;
  bladesT = 0;
  invisT = 0;
  bladeAngle = 0;
  /** Seconds left of the death animation. */
  dying = 0;
  /** Exiting the level: shrinking into the exit. */
  exitT = 0;
  hurtFlash = 0;
  private drainAcc = 0;
  private lowWarned = false;
  /** Cell of the transporter just arrived on, so it does not send us straight back. */
  arrivedOn = -1;
  /** Cell of the transporter we came from, so a boxed-in one doesn't bounce us back. */
  cameFrom = -1;
  /** The stick has been let go since arriving by transporter. */
  releasedSinceArrival = false;

  constructor(public id: 1 | 2 = 1) {}

  get alive() {
    return this.dying <= 0 && this.health > 0;
  }

  update(g: Game) {
    if (this.dying > 0) {
      this.dying -= DT;
      if (this.dying <= 0) g.playerDied(this);
      return;
    }
    this.shieldT = Math.max(0, this.shieldT - DT);
    this.speedT = Math.max(0, this.speedT - DT);
    this.bladesT = Math.max(0, this.bladesT - DT);
    this.invisT = Math.max(0, this.invisT - DT);
    this.hurtFlash = Math.max(0, this.hurtFlash - DT);
    if (this.weaponT > 0 && (this.weaponT -= DT) <= 0) this.weapon = 'gun';

    // Gauntlet's health ticks away, one point a second
    this.drainAcc += DT;
    if (this.drainAcc >= 1) {
      this.drainAcc -= 1;
      this.loseHealth(g, 1);
    }

    const mv: Vec = input.move;
    const md = dir8(mv);
    if (md < 0) this.releasedSinceArrival = true;
    const speed = (this.speedT > 0 ? 170 : 128) * Math.min(1, Math.hypot(mv.x, mv.y) * 1.4);
    if (md >= 0) {
      this.moveDir = md;
      const v = DIR_VEC[md];
      moveBody(g, this, v.x * speed * DT, v.y * speed * DT, (x, y) => g.monsterAt(x, y, 11) !== null);
      this.walkT += DT * (speed / 110);
    } else {
      this.walkT = 0;
    }

    const fd = dir8(input.fire, 0.3);
    this.aimDir = fd >= 0 ? fd : this.moveDir;
    this.fireCd -= DT;
    if (fd >= 0 && this.fireCd <= 0) this.shoot(g, fd);
    this.fireAnim = Math.max(0, this.fireAnim - DT);
    if (input.magic) g.useMagic(this);

    if (this.bladesT > 0) {
      this.bladeAngle += DT * 7;
      for (let i = 0; i < 3; i++) {
        const a = this.bladeAngle + (i * Math.PI * 2) / 3;
        const bx = wrap(this.x + Math.cos(a) * 26), by = wrap(this.y - 12 + Math.sin(a) * 20);
        const m = g.monsterAt(bx, by + 8, 10);
        if (m && m.shootable) m.hit(g, 1, this);
      }
    }
    g.touchCells(this);
  }

  shoot(g: Game, d: number) {
    const v = DIR_VEC[d];
    const mx = this.x + v.x * 4, my = this.y - 14 + v.y * 4;
    this.fireAnim = 0.06;
    if (this.weapon === 'rocket') {
      g.shots.push(new Shot(mx, my, v.x * 360, v.y * 360, 3, 'rocket', this));
      this.fireCd = 0.3;
      audio.play(SND.rocket);
    } else if (this.weapon === 'spread') {
      for (const da of [-0.26, 0, 0.26]) {
        const a = Math.atan2(v.y, v.x) + da;
        g.shots.push(new Shot(mx, my, Math.cos(a) * SHOT_SPEED, Math.sin(a) * SHOT_SPEED, 1, 'shot', this));
      }
      this.fireCd = 0.15;
      audio.play(SND.gun);
    } else {
      g.shots.push(new Shot(mx, my, v.x * SHOT_SPEED, v.y * SHOT_SPEED, 1, 'shot', this));
      this.fireCd = 0.15;
      audio.play(SND.gun);
    }
  }

  loseHealth(g: Game, n: number) {
    if (!this.alive || this.exitT > 0) return;
    this.health = Math.max(0, this.health - n);
    if (this.health <= 200 && !this.lowWarned) {
      // Gauntlet: "your life force is running out"
      this.lowWarned = true;
      audio.play(SND.tenSeconds);
    }
    if (this.health > 300) this.lowWarned = false;
    if (this.health <= 0) {
      this.dying = 1.6;
      audio.play(SND.playerDie);
      g.shake = 0.3;
    }
  }

  /** Damage from a monster; the shield (Smash T.V.'s) keeps it off. */
  hurt(g: Game, n: number) {
    if (this.shieldT > 0) return;
    this.hurtFlash = 0.12;
    this.loseHealth(g, n);
  }

  draw(_g: Game, sx: number, sy: number) {
    const k = this.id === 2 ? 'p2.' : '';
    if (this.dying > 0) {
      const f = Math.floor((1.6 - this.dying) * 15);
      if (f < anim('player.die').length) drawAt(`${k}player.die`, f, sx, sy, 'player.die');
      return;
    }
    if (this.exitT > 0) {
      // spin and shrink into the exit
      const s = Math.max(0.05, 1 - this.exitT / 0.9);
      ctx.save();
      ctx.translate(sx, sy - 10);
      ctx.scale(s, s);
      drawAt(`${k}legs.${DIR_NAME[Math.floor(this.exitT * 20) % 8]}`, 0, 0, 10, 'legs.d');
      drawAt(`${k}torso.${DIR_NAME[Math.floor(this.exitT * 20) % 8]}`, 0, 0, 10, 'legs.d');
      ctx.restore();
      return;
    }
    if (this.shieldT > 0) drawAt(this.id === 2 ? 'ring.p2' : 'ring.p1', 0, sx, sy + 6, 'ring.p1', 0.9);
    const alpha = this.invisT > 0 ? 0.35 : 1;
    const frame = this.walkT > 0 ? Math.floor(this.walkT * 14) : 0;
    drawAt(`${k}legs.${DIR_NAME[this.moveDir]}`, frame, sx, sy, 'legs.d', alpha);
    drawAt(`${k}torso.${DIR_NAME[this.aimDir]}`, this.fireAnim > 0 ? 1 : 0, sx, sy, 'legs.d', alpha);
    if (this.hurtFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawAt(`${k}torso.${DIR_NAME[this.aimDir]}`, 0, sx, sy, 'legs.d', 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.bladesT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.bladeAngle + (i * Math.PI * 2) / 3;
        drawAt('blade', Math.floor(this.bladeAngle * 4) + i, sx + Math.cos(a) * 26, sy - 4 + Math.sin(a) * 20, 'blade');
      }
    }
  }
}

// ---------------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------------

export const SHOT_SPEED = 520;
export type ShotKind = 'shot' | 'rocket' | 'fireball';

export class Shot implements Drawable {
  dead = false;
  t = 0;
  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public dmg: number,
    public kind: ShotKind,
    public owner: Player | null,
  ) {}

  update(g: Game) {
    this.t += DT;
    // sub-steps so a shot never skips a cell or a monster
    const steps = Math.ceil((Math.hypot(this.vx, this.vy) * DT) / 6);
    for (let s = 0; s < steps && !this.dead; s++) {
      this.x = wrap(this.x + (this.vx * DT) / steps);
      this.y = wrap(this.y + (this.vy * DT) / steps);
      if (this.owner) this.hitAsPlayers(g);
      else this.hitAsMonsters(g);
    }
    if (this.t > 2.5) this.dead = true;
  }

  private stop(g: Game) {
    this.dead = true;
    if (this.kind === 'rocket') g.blast(this.x, this.y, 40, 3, this.owner);
    else g.effect('spark', this.x, this.y + 4, 20);
  }

  private hitAsPlayers(g: Game) {
    const col = Math.floor(this.x / CELL), row = Math.floor(this.y / CELL);
    if (g.shotCell(col, row, this)) return this.stop(g);
    const m = g.monsterAt(this.x, this.y + 10, 5);
    if (m && m.kind === 'death') {
      // shots glance off Death; only a potion kills it
      if (!m.hinted) {
        m.hinted = true;
        g.effects.push(new Floater(m.x, m.y - 24, 'USE A POTION!', '#f88', 2));
      }
      this.stop(g);
    } else if (m && m.shootable) {
      m.hit(g, this.dmg, this.owner);
      this.stop(g);
    }
  }

  private hitAsMonsters(g: Game) {
    const col = Math.floor(this.x / CELL), row = Math.floor(this.y / CELL);
    if (g.maze.solidCell(col, row)) {
      this.dead = true;
      g.effect('boom', this.x, this.y + 4, 20);
      return;
    }
    for (const p of g.players) {
      if (p.alive && Math.hypot(wrapd(p.x - this.x), wrapd(p.y - 12 - this.y)) < 12) {
        this.dead = true;
        p.hurt(g, 10);
        g.effect('boom', this.x, this.y + 4, 20);
        return;
      }
    }
  }

  draw(_g: Game, sx: number, sy: number) {
    if (this.kind === 'fireball') {
      drawAt('eshot', Math.floor(this.t * 12), sx, sy + 3, 'eshot');
      return;
    }
    const n = Math.hypot(this.vx, this.vy) || 1;
    const ux = this.vx / n, uy = this.vy / n;
    if (this.kind === 'rocket') {
      ctx.strokeStyle = '#ff6a00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx - ux * 10, sy - uy * 10);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.fillStyle = '#fff1a0';
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
      return;
    }
    // Smash T.V.'s bullet: a short bright streak along its path
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(sx - ux * 7) + 0.5, Math.round(sy - uy * 7) + 0.5);
    ctx.lineTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
}

/** Mr. Shrapnel's lob: flies over walls to where the player was. */
export class Lob implements Drawable {
  dead = false;
  t = 0;
  readonly dur: number;
  constructor(
    public x: number,
    public y: number,
    private tx: number,
    private ty: number,
    private dmg: number,
  ) {
    this.dur = clamp(Math.hypot(wrapd(tx - x), wrapd(ty - y)) / 220, 0.5, 1.3);
    this.vx = wrapd(tx - x) / this.dur;
    this.vy = wrapd(ty - y) / this.dur;
  }
  private vx: number;
  private vy: number;

  update(g: Game) {
    this.t += DT;
    this.x = wrap(this.x + this.vx * DT);
    this.y = wrap(this.y + this.vy * DT);
    if (this.t >= this.dur) {
      this.dead = true;
      g.effect('boom', this.tx, this.ty + 2, 18);
      for (const p of g.players) if (p.alive && Math.hypot(wrapd(p.x - this.tx), wrapd(p.y - this.ty)) < 24) p.hurt(g, this.dmg);
    }
  }

  draw(_g: Game, sx: number, sy: number) {
    const k = this.t / this.dur;
    const h = Math.sin(k * Math.PI) * 48;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 1, 6, 3);
    drawAt('eshot.green', Math.floor(this.t * 12), sx, sy - h, 'eshot.green');
  }
}

// ---------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------

export class Effect implements Drawable {
  dead = false;
  t = 0;
  constructor(
    public name: string,
    public x: number,
    public y: number,
    public fps = 15,
  ) {}
  update() {
    this.t += DT;
    if (this.t * this.fps >= anim(this.name).length) this.dead = true;
  }
  draw(_g: Game, sx: number, sy: number) {
    if (this.t < 0) return;
    drawAt(this.name, Math.floor(this.t * this.fps), sx, sy);
  }
}

/** Floating score text. */
export class Floater implements Drawable {
  dead = false;
  t = 0;
  constructor(
    public x: number,
    public y: number,
    public text: string,
    public color = '#fff',
    public life = 0.9,
  ) {}
  update() {
    this.t += DT;
    this.y -= (27 / this.life) * DT;
    if (this.t > this.life) this.dead = true;
  }
  draw(g: Game, sx: number, sy: number) {
    g.drawLabel(this.text, sx, sy, this.color, Math.min(1, 2 * (1 - this.t / this.life)));
  }
}

// ---------------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------------

interface KindInfo {
  speed: number;
  /** damage per touch (per bite for the melee monsters) at level 1, 2, 3 */
  dmg: [number, number, number];
  score: number;
}

const KIND: Record<MonsterKind, KindInfo> = {
  ghost: { speed: 92, dmg: [10, 20, 30], score: 10 },
  grunt: { speed: 70, dmg: [5, 8, 10], score: 20 },
  demon: { speed: 74, dmg: [5, 8, 10], score: 30 },
  lobber: { speed: 64, dmg: [5, 8, 10], score: 40 },
  sorcerer: { speed: 80, dmg: [5, 8, 10], score: 40 },
  death: { speed: 112, dmg: [0, 0, 0], score: 1000 },
};

export class Monster implements Body, Drawable {
  hw = 9;
  hh = 12;
  dead = false;
  t = rand(0, 5);
  dir = 4;
  biteCd = 0;
  shotCd = rand(1, 3);
  /** Sidestep heading after bumping into something, and how long to keep it. */
  side: Vec | null = null;
  sideT = 0;
  /** Seconds of the hit flash. */
  flash = 0;
  /** Death: how much health it has drained so far. */
  drained = 0;
  /** Has shown the "use a potion" hint. */
  hinted = false;
  moving = false;

  constructor(
    public kind: MonsterKind,
    public level: number,
    public x: number,
    public y: number,
  ) {
    if (kind === 'ghost' || kind === 'death') this.hw = 10;
  }

  get shootable() {
    if (this.kind === 'death') return false;
    // sorcerers can't be hit while they've faded out
    if (this.kind === 'sorcerer') return this.visible;
    return true;
  }

  get visible() {
    return this.kind !== 'sorcerer' || (this.t % 3.2) < 2.1;
  }

  update(g: Game) {
    this.t += DT;
    this.flash = Math.max(0, this.flash - DT);
    this.biteCd -= DT;
    this.shotCd -= DT;
    const p = g.nearestPlayer(this.x, this.y);
    if (!p) return;
    const dx = wrapd(p.x - this.x), dy = wrapd(p.y - this.y);
    const d = Math.hypot(dx, dy);
    if (d > 640) return; // asleep until a contestant comes near
    const info = KIND[this.kind];

    // contact
    if (d < 24) {
      if (this.kind === 'ghost') {
        p.hurt(g, info.dmg[this.level - 1]);
        this.dead = true;
        g.effect('puff', this.x, this.y + 4, 16);
        audio.play(SND.hit, { overlap: true });
        return;
      }
      if (this.kind === 'death') {
        // Death drains health until it has had 200, then leaves
        if (this.drained === 0 && p.shieldT <= 0) audio.play(SND.laugh);
        const n = Math.min(4, 200 - this.drained);
        p.hurt(g, n);
        this.drained += n;
        if (this.drained >= 200) {
          this.dead = true;
          g.effect('puff', this.x, this.y, 12);
        }
        return;
      }
      if (this.biteCd <= 0) {
        this.biteCd = 0.5;
        p.hurt(g, info.dmg[this.level - 1]);
        audio.play(SND.hit, { overlap: true, volume: 0.6 });
      }
    }

    // invisible contestants are left alone (except by Death)
    const hunting = p.invisT <= 0 || this.kind === 'death';
    let ux = 0, uy = 0;
    if (this.kind === 'lobber' && hunting) {
      // keep away and lob over the walls
      if (d < 130) {
        ux = -dx / d;
        uy = -dy / d;
      } else if (d > 220) {
        ux = dx / d;
        uy = dy / d;
      }
      if (d < 330 && this.shotCd <= 0) {
        this.shotCd = rand(1.8, 3);
        g.lobs.push(new Lob(this.x, this.y - 16, p.x, p.y, 10));
      }
    } else if (hunting) {
      ux = Math.abs(dx) > 6 ? Math.sign(dx) : 0;
      uy = Math.abs(dy) > 6 ? Math.sign(dy) : 0;
      if (this.kind === 'demon' && this.shotCd <= 0 && d < 340) this.tryFire(g, dx, dy);
    } else {
      // wander
      const a = Math.sin(this.t * 0.7 + this.x) * Math.PI;
      ux = Math.cos(a);
      uy = Math.sin(a);
    }

    if (this.sideT > 0 && this.side) {
      this.sideT -= DT;
      ux = this.side.x;
      uy = this.side.y;
    }
    const n = Math.hypot(ux, uy);
    this.moving = false;
    if (n > 0) {
      ux /= n;
      uy /= n;
      const sp = info.speed * (this.kind === 'sorcerer' && !this.visible ? 1.25 : 1) * DT;
      const ok = moveBody(g, this, ux * sp, uy * sp, (x, y) => g.blockedForMonster(this, x, y));
      this.moving = ok;
      if (!ok && this.sideT <= 0) {
        // bumped into a wall or a crowd: sidestep for a moment
        const perp = Math.random() < 0.5 ? { x: -uy, y: ux } : { x: uy, y: -ux };
        this.side = perp;
        this.sideT = rand(0.2, 0.6);
      }
      const dd = dir8({ x: ux, y: uy }, 0.01);
      if (dd >= 0) this.dir = dd;
    }
  }

  private tryFire(g: Game, dx: number, dy: number) {
    // demons fire along the eight directions, like Gauntlet's
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const lined = ax < 14 || ay < 14 || Math.abs(ax - ay) < 14;
    if (!lined || !g.maze.clearLine(this.x, this.y - 14, dx, dy)) return;
    this.shotCd = rand(1.4, 2.4);
    const d = Math.hypot(dx, dy) || 1;
    const fdir = dir8({ x: dx / d, y: dy / d }, 0.01);
    const v = DIR_VEC[fdir];
    g.shots.push(new Shot(this.x, this.y - 14, v.x * 230, v.y * 230, 1, 'fireball', null));
  }

  /** Hit by a shot (or blades): monsters drop a level per hit, as in Gauntlet. */
  hit(g: Game, n: number, by: Player | null) {
    if (this.dead) return;
    this.flash = 0.1;
    this.level -= n;
    if (this.level <= 0) this.kill(g, by);
    else audio.play(SND.hit, { overlap: true, volume: 0.5 });
  }

  kill(g: Game, by: Player | null) {
    this.dead = true;
    g.addScore(by, KIND[this.kind].score, this.x, this.y - 24);
    switch (this.kind) {
      case 'grunt':
        g.effect('grunt.die', this.x, this.y, 18);
        audio.play(SND.splat, { overlap: true, volume: 0.8 });
        break;
      case 'demon':
        g.effect('spear.die', this.x, this.y, 18);
        audio.play(SND.splat, { overlap: true, volume: 0.8 });
        break;
      case 'lobber':
        g.effect('puff', this.x, this.y, 16);
        audio.play(SND.explode, { overlap: true, volume: 0.6 });
        break;
      default:
        g.effect('puff', this.x, this.y + 2, 16);
        audio.play(SND.splat, { overlap: true, volume: 0.6 });
    }
  }

  draw(_g: Game, sx: number, sy: number) {
    const f = Math.floor(this.t * 10);
    const walk = this.moving ? f : 0;
    switch (this.kind) {
      case 'ghost':
        drawAt('orb', f, sx, sy + 2, 'orb');
        break;
      case 'grunt':
        drawAt(`grunt.${DIR_NAME[this.dir]}`, walk, sx, sy, 'grunt.d');
        break;
      case 'demon':
        drawAt(`spear.${DIR_NAME[this.dir]}`, walk, sx, sy, 'spear.d');
        break;
      case 'lobber': {
        const v = DIR_VEC[this.dir];
        const name = Math.abs(v.y) > Math.abs(v.x) ? (v.y < 0 ? 'shrapnel.u' : 'shrapnel.d') : v.x < 0 ? 'shrapnel.l' : 'shrapnel.r';
        drawAt(name, walk, sx, sy + 4, 'shrapnel.d');
        break;
      }
      case 'sorcerer': {
        const vis = this.visible;
        // fade out and back in
        const k = this.t % 3.2;
        const a = vis ? Math.min(1, k * 4, (2.1 - k) * 4) : 0.12;
        drawAt(vis ? 'bossorb.green' : 'bossorb.purple', f, sx, sy, 'bossorb.green', Math.max(0.12, a));
        break;
      }
      case 'death':
        drawAt('mutoid.head', Math.floor(this.t * 6), sx, sy + 4, 'mutoid.head');
        break;
    }
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(Math.round(sx) - 8, Math.round(sy) - 22, 16, 20);
    }
    // the monster's level, as Gauntlet's three strengths: small pips
    if (this.level > 1 && this.kind !== 'death') {
      ctx.fillStyle = this.level === 3 ? '#ff5050' : '#ffd040';
      for (let i = 0; i < this.level; i++) ctx.fillRect(Math.round(sx) - 4 + i * 4, Math.round(sy) + 2, 2, 2);
    }
  }
}

// ---------------------------------------------------------------------------------
// Generators: Gauntlet's own bone piles and boxes
// ---------------------------------------------------------------------------------

const GEN_BASE: Record<string, number> = { ghost: 0x19, grunt: 0x1c, demon: 0x1f, lobber: 0x22, sorcerer: 0x25 };

export class Generator implements Drawable {
  dead = false;
  cd = rand(0.5, 3);
  flash = 0;
  constructor(
    public kind: Exclude<MonsterKind, 'death'>,
    public level: number,
    public col: number,
    public row: number,
  ) {}

  get x() {
    return this.col * CELL + CELL / 2;
  }
  get y() {
    return this.row * CELL + CELL;
  }

  update(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.nearestPlayer(this.x, this.y);
    if (!p || Math.hypot(wrapd(p.x - this.x), wrapd(p.y - this.y)) > 420) return;
    if ((this.cd -= DT) > 0) return;
    this.cd = rand(1.6, 3.6) / (0.7 + this.level * 0.3);
    if (g.monsters.length >= 160) return;
    // into a free neighbouring cell, preferring the side towards the contestant
    const cells: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) cells.push([this.col + dc, this.row + dr]);
    cells.sort(() => Math.random() - 0.5);
    for (const [c, r] of cells) {
      const x = wrap(c * CELL + CELL / 2), y = wrap(r * CELL + CELL - 4);
      if (!g.maze.boxClear(x - 10, y - 13, x + 10, y)) continue;
      if (g.monsterAt(x, y, 12) || g.playerNear(x, y, 22)) continue;
      g.monsters.push(new Monster(this.kind, this.level, x, y));
      return;
    }
  }

  /** Each hit knocks the generator down a level; the last one destroys it. */
  hit(g: Game, n: number, by: Player | null) {
    this.flash = 0.1;
    this.level -= n;
    if (this.level <= 0) {
      this.dead = true;
      g.maze.blocked[(this.row & 31) * 32 + (this.col & 31)] = 0;
      g.addScore(by, 100, this.x, this.y - 30);
      g.effect('puff', this.x, this.y - 4, 12);
      g.effect('boom', this.x + rand(-8, 8), this.y - 10, 14);
      audio.play(SND.explode, { overlap: true, volume: 0.8 });
    } else {
      audio.play(SND.hit, { overlap: true, volume: 0.6 });
    }
  }

  draw(_g: Game, sx: number, sy: number) {
    drawObj((GEN_BASE[this.kind] + this.level - 1).toString(16), sx, sy - CELL / 2);
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(Math.round(sx) - 16, Math.round(sy) - 32, 32, 32);
    }
  }
}

