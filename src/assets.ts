// Loads both games' extracted assets: Smash T.V.'s sprites, animations and fonts (from the
// smashtv port), and Gauntlet's mazes, tiles, palettes and maze objects (tools/extract.ts).
import type { Palettes, PfTables } from './game/playfield';

export interface DoorPiece {
  name: string;
  xoff: number;
}

/** [page, x, y, w, h, xoff, yoff] */
export type FrameData = [number, number, number, number, number, number, number];
/** A frame reference inside an animation: [frame key, flipped] */
export type AnimFrame = [string, number];

export interface LevelData {
  header: string;
  floorPattern: number;
  wallPattern: number;
  floorColor: number;
  wallColor: number;
  grid: string;
}

export interface Assets {
  pages: HTMLImageElement[];
  frames: Record<string, FrameData>;
  anims: Record<string, AnimFrame[]>;
  fonts: { big: Record<string, string>; small: Record<string, string> };
  gauntlet: {
    palettes: Palettes;
    tables: PfTables & { door: number[]; doorH: DoorPiece[]; doorV: DoorPiece[] };
    levels: LevelData[];
    /** 8x8 tiles, 4 bits per pixel, two pixels a byte */
    tiles: Uint8Array;
    objects: HTMLImageElement;
    /** [x, y, w, h] in objects.png */
    objFrames: Record<string, [number, number, number, number]>;
  };
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

async function fetchOk(name: string) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`failed to load ${name} (run "npm run extract -- <gauntlet.zip>")`);
  return r;
}
const json = async <T>(name: string) => (await fetchOk(name)).json() as Promise<T>;

export let assets: Assets;

export async function loadAssets(): Promise<Assets> {
  const [sprites, anims, gdata, tiles, objFrames, objects] = await Promise.all([
    json<{ pages: number; frames: Record<string, FrameData> }>('smashtv/sprites.json'),
    json<{ anims: Assets['anims']; fonts: Assets['fonts'] }>('smashtv/anims.json'),
    json<Pick<Assets['gauntlet'], 'palettes' | 'tables' | 'levels'>>('gauntlet/data.json'),
    fetchOk('gauntlet/tiles.bin').then((r) => r.arrayBuffer()),
    json<Assets['gauntlet']['objFrames']>('gauntlet/objects.json'),
    loadImage(`${BASE}gauntlet/objects.png`),
  ]);
  const pages = await Promise.all(Array.from({ length: sprites.pages }, (_, i) => loadImage(`${BASE}smashtv/sprites-${i}.png`)));
  assets = {
    pages,
    frames: sprites.frames,
    anims: anims.anims,
    fonts: anims.fonts,
    gauntlet: { ...gdata, tiles: new Uint8Array(tiles), objects, objFrames },
  };
  return assets;
}

export function anim(name: string): AnimFrame[] {
  const a = assets.anims[name];
  if (!a) throw new Error(`unknown animation ${name}`);
  return a;
}
