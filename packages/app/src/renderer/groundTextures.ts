import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { mulberry32 } from "../simulationEngineRandom";

/**
 * Tiling ground textures, painted once per session: stone paving for the plaza,
 * asphalt for streets, grass for the countryside.
 *
 * The ground was flat colour everywhere, and a flat plane gives the eye nothing
 * to judge scale or distance by, which is a large part of why the city read as
 * a model rather than a place. Each texture is drawn at a known real size so a
 * material can repeat it per metre.
 */
export type GroundTextures = {
  asphalt: Texture;
  grass: Texture;
  paving: Texture;
};

/** Metres covered by one tile of each texture. */
export const groundTileMeters = { asphalt: 4, grass: 8, paving: 3 } as const;

let cached: GroundTextures | null | undefined;

/** Null where there is no 2D canvas (jsdom, workers): materials keep flat colour. */
export function groundTextures(): GroundTextures | null {
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return (cached = null);
  if (!document.createElement("canvas").getContext("2d")) return (cached = null);
  cached = {
    asphalt: canvasTile(drawAsphalt),
    grass: canvasTile(drawGrass),
    paving: canvasTile(drawPaving),
  };
  return cached;
}

/** Set a texture's repeat so one tile spans `tileMeters` over a surface. */
export function repeatFor(
  texture: Texture,
  widthMeters: number,
  heightMeters: number,
  tileMeters: number,
) {
  const repeated = texture.clone();
  repeated.repeat.set(widthMeters / tileMeters, heightMeters / tileMeters);
  repeated.needsUpdate = true;
  return repeated;
}

/**
 * A 256 px repeating canvas texture, painted once with a fixed-seed random
 * stream so it is identical every session. Shared with the facade textures.
 */
export function canvasTile(
  draw: (ctx: CanvasRenderingContext2D, size: number, random: () => number) => void,
  { anisotropy = 8, srgb = true }: { anisotropy?: number; srgb?: boolean } = {},
) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext("2d")!, size, mulberry32(0x2f6b9d1));
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  random: () => number,
  count: number,
  colours: readonly string[],
  maxRadius: number,
) {
  for (let index = 0; index < count; index++) {
    ctx.fillStyle = colours[Math.floor(random() * colours.length)];
    const radius = 0.4 + random() * maxRadius;
    ctx.fillRect(random() * size, random() * size, radius, radius);
  }
}

/** 3 m of 0.75 m square stone slabs, each a slightly different tone, with joints. */
function drawPaving(ctx: CanvasRenderingContext2D, size: number, random: () => number) {
  const slabs = 4;
  const slab = size / slabs;
  for (let row = 0; row < slabs; row++) {
    for (let column = 0; column < slabs; column++) {
      const tone = 196 + Math.floor(random() * 22);
      ctx.fillStyle = `rgb(${tone + 6},${tone + 2},${tone - 8})`;
      ctx.fillRect(column * slab, row * slab, slab, slab);
    }
  }
  speckle(
    ctx,
    size,
    random,
    2600,
    ["rgba(90,84,74,0.18)", "rgba(255,255,250,0.2)"],
    1.6,
  );
  ctx.fillStyle = "rgba(92,86,76,0.55)";
  for (let index = 0; index <= slabs; index++) {
    ctx.fillRect(index * slab - 1, 0, 2, size);
    ctx.fillRect(0, index * slab - 1, size, 2);
  }
}

/** Asphalt: dark aggregate with light and dark stones and faint wear patches. */
function drawAsphalt(
  ctx: CanvasRenderingContext2D,
  size: number,
  random: () => number,
) {
  ctx.fillStyle = "#4a4f55";
  ctx.fillRect(0, 0, size, size);
  for (let index = 0; index < 14; index++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 18 + random() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(
    ctx,
    size,
    random,
    5200,
    ["rgba(20,22,24,0.55)", "rgba(150,150,145,0.45)", "rgba(95,98,100,0.5)"],
    1.3,
  );
}

/** Grass: mottled greens with a few darker tufts. */
function drawGrass(ctx: CanvasRenderingContext2D, size: number, random: () => number) {
  ctx.fillStyle = "#7a9c5c";
  ctx.fillRect(0, 0, size, size);
  for (let index = 0; index < 40; index++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(60,90,40,0.12)" : "rgba(170,190,110,0.1)";
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 10 + random() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, size, random, 3000, ["rgba(50,80,35,0.35)", "rgba(160,185,110,0.3)"], 2);
}
