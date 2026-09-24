import type { Texture } from "three";
import { canvasTile } from "./groundTextures";

/**
 * Procedural facade textures, drawn once per session.
 *
 * Buildings used to carry one Mesh per window pane — every facade of every
 * building, so a single tower was dozens of draw calls and the city could not
 * afford more than a handful of them. A tiled texture gives each facade the
 * same windows for zero extra geometry. White walls are tinted per building by
 * vertex colour, so one texture serves every palette.
 *
 * One tile covers `TILE_BAYS` bays by `TILE_FLOORS` floors; the emissive twin
 * lights a random subset of those windows so a night skyline is not a uniform
 * grid of identical lit panes.
 */
export const TILE_BAYS = 4;
export const TILE_FLOORS = 4;

type FacadeTextureSet = { emissive: Texture; map: Texture };

type CityTextures = {
  curtain: FacadeTextureSet;
  punched: FacadeTextureSet;
};

let cached: CityTextures | null | undefined;

/** Null where there is no 2D canvas (jsdom, workers): materials fall back to flat colour. */
export function cityTextures(): CityTextures | null {
  if (cached !== undefined) return cached;
  cached = build();
  return cached;
}

function build(): CityTextures | null {
  if (typeof document === "undefined") return null;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;

  return {
    curtain: {
      emissive: canvasTile(
        (ctx, size, random) => drawLitWindows(ctx, size, "curtain", 0.34, random),
        { anisotropy: 4, srgb: false },
      ),
      map: canvasTile((ctx, size) => drawCurtainWall(ctx, size), { anisotropy: 4 }),
    },
    punched: {
      emissive: canvasTile(
        (ctx, size, random) => drawLitWindows(ctx, size, "punched", 0.28, random),
        { anisotropy: 4, srgb: false },
      ),
      map: canvasTile((ctx, size) => drawPunchedWall(ctx, size), { anisotropy: 4 }),
    },
  };
}

/** Masonry with recessed windows: brick, plaster, shopfronts. */
function drawPunchedWall(ctx: CanvasRenderingContext2D, size: number) {
  const bay = size / TILE_BAYS;
  const floor = size / TILE_FLOORS;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Floor band so storeys read even from far away.
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  for (let f = 0; f < TILE_FLOORS; f++) ctx.fillRect(0, f * floor + floor - 4, size, 4);

  for (let b = 0; b < TILE_BAYS; b++) {
    for (let f = 0; f < TILE_FLOORS; f++) {
      const x = b * bay + bay * 0.24;
      const y = f * floor + floor * 0.18;
      const w = bay * 0.52;
      const h = floor * 0.56;
      // Reveal shadow, then glass, then a sill.
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      const glass = ctx.createLinearGradient(0, y, 0, y + h);
      glass.addColorStop(0, "#5f7486");
      glass.addColorStop(1, "#2e3c48");
      ctx.fillStyle = glass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x - 3, y + h, w + 6, 3);
    }
  }
}

/** Glass curtain wall with mullions and spandrels: towers, offices. */
function drawCurtainWall(ctx: CanvasRenderingContext2D, size: number) {
  const bay = size / TILE_BAYS;
  const floor = size / TILE_FLOORS;
  const sky = ctx.createLinearGradient(0, 0, size, size);
  sky.addColorStop(0, "#dbe7ef");
  sky.addColorStop(0.5, "#b3c6d3");
  sky.addColorStop(1, "#8ea5b5");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  // Spandrel panels between floors.
  ctx.fillStyle = "rgba(40,52,62,0.55)";
  for (let f = 0; f < TILE_FLOORS; f++)
    ctx.fillRect(0, f * floor + floor * 0.8, size, floor * 0.2);

  // Mullions.
  ctx.fillStyle = "rgba(245,248,250,0.75)";
  for (let b = 0; b <= TILE_BAYS; b++) ctx.fillRect(b * bay - 1.5, 0, 3, size);
  for (let f = 0; f <= TILE_FLOORS; f++) ctx.fillRect(0, f * floor - 1, size, 2);
}

/** Black with some windows lit warm, the rest dark. Drives night emissive. */
function drawLitWindows(
  ctx: CanvasRenderingContext2D,
  size: number,
  kind: "curtain" | "punched",
  litShare: number,
  next: () => number,
) {
  const bay = size / TILE_BAYS;
  const floor = size / TILE_FLOORS;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  for (let b = 0; b < TILE_BAYS; b++) {
    for (let f = 0; f < TILE_FLOORS; f++) {
      if (next() > litShare) continue;
      const warmth = next();
      ctx.fillStyle = warmth < 0.7 ? "#ffd58a" : warmth < 0.9 ? "#ffe9c2" : "#bfe3ff";
      if (kind === "punched") {
        ctx.fillRect(
          b * bay + bay * 0.24,
          f * floor + floor * 0.18,
          bay * 0.52,
          floor * 0.56,
        );
      } else {
        ctx.fillRect(b * bay + 2, f * floor + 2, bay - 4, floor * 0.8 - 4);
      }
    }
  }
}
