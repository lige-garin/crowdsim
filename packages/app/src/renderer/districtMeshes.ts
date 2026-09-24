import { Color, DoubleSide, MeshStandardMaterial, type Object3D } from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { contains, districtKeepOut, rectOf, type Rect } from "../cityLayout";
import { BoxBatch } from "./boxBatch";
import { createShopFronts } from "./shopFronts";

/**
 * The simulated district, dressed so you can read it.
 *
 * The first pass drew the district as a flat plaza with glass boxes too faint
 * to see, so the one part of the city that is actually simulated was the part
 * with least in it. Here the pavilions have tinted glass, a visible floor and a
 * translucent roof; each shop inside has a glazed front, a door and a named
 * sign (`shopFronts`), so from the default camera you can see where the stores
 * are and the shoppers in them. The plaza gets a paving grid and planted beds instead of bare concrete.
 *
 * Nothing here is placed on anything people walk to (`districtKeepOut`).
 */
/** Scene rectangle (y down) to render rectangle (z up, centred on the district). */
export function sceneRectToRender(scene: CrowdSimScene) {
  const W = scene.world.width;
  const H = scene.world.height;
  return (rect: Rect) => ({
    x0: rect.minX - W / 2,
    x1: rect.maxX - W / 2,
    y0: H / 2 - rect.maxY,
    y1: H / 2 - rect.minY,
  });
}

export function createDistrictObjects(scene: CrowdSimScene): Object3D[] {
  const render = sceneRectToRender(scene);

  return [
    ...createPlanters(scene, render),
    ...createPavilions(scene, render),
    ...createShopFronts(scene, render),
  ];
}

type Render = (rect: Rect) => { x0: number; x1: number; y0: number; y1: number };

function createPlanters(scene: CrowdSimScene, render: Render) {
  const keepOut = districtKeepOut(scene);
  const kerbs = new BoxBatch();
  const beds = new BoxBatch();
  const stone = new Color("#a8a397");
  const soil = new Color("#6f9a4d");
  const size = 7;
  for (let y = 10; y < scene.world.height - 8; y += 16) {
    for (let x = 12; x < scene.world.width - 10; x += 18) {
      const rect: Rect = { maxX: x + size, maxY: y + size, minX: x, minY: y };
      const corners = [
        [rect.minX, rect.minY],
        [rect.maxX, rect.minY],
        [rect.minX, rect.maxY],
        [rect.maxX, rect.maxY],
      ];
      if (corners.some(([cx, cy]) => keepOut.some((zone) => contains(zone, cx, cy))))
        continue;
      const r = render(rect);
      kerbs.box(r.x0, r.x1, r.y0, r.y1, 0, 0.45, stone, { sides: true, top: false });
      beds.box(r.x0 + 0.3, r.x1 - 0.3, r.y0 + 0.3, r.y1 - 0.3, 0, 0.4, soil, {
        sides: false,
        top: true,
      });
    }
  }
  return [
    kerbs.toMesh(
      new MeshStandardMaterial({ roughness: 0.9, vertexColors: true }),
      "district-planter-kerbs",
    ),
    beds.toMesh(
      new MeshStandardMaterial({ roughness: 1, vertexColors: true }),
      "district-planter-beds",
    ),
  ];
}

function createPavilions(scene: CrowdSimScene, render: Render) {
  const glass = new MeshStandardMaterial({
    color: "#8fc7de",
    depthWrite: false,
    metalness: 0.2,
    opacity: 0.3,
    roughness: 0.05,
    side: DoubleSide,
    transparent: true,
  });
  const roofGlass = new MeshStandardMaterial({
    color: "#eef3f4",
    depthWrite: false,
    opacity: 0.42,
    roughness: 0.3,
    side: DoubleSide,
    transparent: true,
  });
  const shell = new BoxBatch();
  const roof = new BoxBatch();
  const frame = new BoxBatch();
  const floor = new BoxBatch();
  const white = new Color("#f4f2ed");
  const clear = new Color("#ffffff");
  const interior = new Color("#e6dccb");

  for (const building of scene.buildings) {
    const r = render(rectOf(building.footprint.points));
    const height = Math.max(4.5, Math.min(building.heightMeters ?? 9, 9));
    floor.box(r.x0, r.x1, r.y0, r.y1, 0, 0.05, interior, { sides: false, top: true });
    shell.box(r.x0, r.x1, r.y0, r.y1, 0.05, height, clear, { sides: true, top: false });
    roof.box(r.x0, r.x1, r.y0, r.y1, height, height + 0.08, clear, {
      sides: false,
      top: true,
    });
    // Perimeter beam and mullions every 6m so the glass reads as a building.
    frame.box(
      r.x0 - 0.35,
      r.x1 + 0.35,
      r.y0 - 0.35,
      r.y1 + 0.35,
      height,
      height + 0.6,
      white,
      { sides: true, top: false },
    );
    for (let x = r.x0; x <= r.x1 + 0.01; x += 6) {
      for (const y of [r.y0, r.y1])
        frame.box(x - 0.15, x + 0.15, y - 0.15, y + 0.15, 0, height, white, {
          sides: true,
          top: false,
        });
    }
    for (let y = r.y0; y <= r.y1 + 0.01; y += 6) {
      for (const x of [r.x0, r.x1])
        frame.box(x - 0.15, x + 0.15, y - 0.15, y + 0.15, 0, height, white, {
          sides: true,
          top: false,
        });
    }
  }

  const shellMesh = shell.toMesh(glass, "district-pavilion-glass", false);
  shellMesh.renderOrder = 3;
  const roofMesh = roof.toMesh(roofGlass, "district-pavilion-roof", false);
  roofMesh.renderOrder = 4;
  return [
    floor.toMesh(
      new MeshStandardMaterial({ roughness: 0.8, vertexColors: true }),
      "district-pavilion-floor",
      false,
    ),
    shellMesh,
    roofMesh,
    frame.toMesh(
      new MeshStandardMaterial({ roughness: 0.55, vertexColors: true }),
      "district-pavilion-frames",
    ),
  ];
}
