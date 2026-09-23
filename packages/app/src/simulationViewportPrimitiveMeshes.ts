import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { facadeWindows } from "./buildingFacade";
import { groundTextures, groundTileMeters, repeatFor } from "./groundTextures";
import { streetDressingPlacements } from "./streetDressing";
import type {
  BioCityRenderAssetPlacement,
  BioCityRenderPrimitive,
} from "./bioCityRenderPlan";
import type { ViewMode } from "./simulationViewportTypes";
import { primitiveBounds, toRenderX, toRenderY } from "./simulationViewportGeometry";

export function createBioCityPrimitiveMesh(
  primitive: BioCityRenderPrimitive,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  if (primitive.kind === "building") {
    const bounds = primitiveBounds(primitive.points);
    const is3d = viewMode === "3d";
    // Taller, lit volumes so buildings read as buildings (not flat tiles).
    const height = is3d ? Math.max(2.5, primitive.heightMeters * 0.34) : 0.08;
    const group = new Group();
    group.name = "inline-building";
    // 3d uses lit materials so the day/night light gives shaded, solid facades;
    // 2d (top-down) has no scene lighting, so it keeps flat unlit colours.
    const litMaterial = (color: string) =>
      is3d
        ? new MeshStandardMaterial({ color, roughness: 0.82 })
        : new MeshBasicMaterial({ color });
    const body = new Mesh(
      new BoxGeometry(bounds.width, bounds.height, height),
      litMaterial(primitive.color),
    );
    const roof = new Mesh(
      new BoxGeometry(bounds.width * 1.04, bounds.height * 1.04, is3d ? 0.4 : 0.16),
      litMaterial(is3d ? "#2f3a48" : "#d9e4ee"),
    );
    const sign = new Mesh(
      new BoxGeometry(bounds.width * 0.55, 0.42, 0.36),
      new MeshBasicMaterial({ color: "#f59e0b" }),
    );

    body.position.set(0, 0, height / 2);
    roof.position.set(0, 0, height + (is3d ? 0.2 : 0.08));
    sign.position.set(0, -bounds.height / 2 - 0.08, Math.max(0.8, height * 0.54));
    if (is3d) {
      body.castShadow = true;
      body.receiveShadow = true;
      roof.castShadow = true;
    }
    group.add(body, roof, sign);

    if (is3d) {
      // Emissive window grid on every facade: shaded panes by day, lit at night.
      const windowMaterial = new MeshStandardMaterial({
        color: "#dbeafe",
        emissive: "#ffd23a",
        emissiveIntensity: 0.5,
        roughness: 0.4,
      });
      for (const win of facadeWindows(bounds.width, height)) {
        for (const face of [-1, 1]) {
          const pane = new Mesh(
            new BoxGeometry(win.width, 0.06, win.height),
            windowMaterial,
          );
          pane.position.set(
            win.offset,
            face * (bounds.height / 2 + 0.03),
            win.vertical,
          );
          group.add(pane);
        }
      }
      for (const win of facadeWindows(bounds.height, height)) {
        for (const face of [-1, 1]) {
          const pane = new Mesh(
            new BoxGeometry(0.06, win.width, win.height),
            windowMaterial,
          );
          pane.position.set(face * (bounds.width / 2 + 0.03), win.offset, win.vertical);
          group.add(pane);
        }
      }
    } else {
      for (let index = 0; index < 4; index++) {
        const strip = new Mesh(
          new BoxGeometry(bounds.width * 0.74, 0.06, 0.08),
          new MeshBasicMaterial({ color: "#a7f3ff" }),
        );
        strip.position.set(
          0,
          -bounds.height / 2 - 0.09,
          Math.max(0.52, height * (0.22 + index * 0.16)),
        );
        group.add(strip);
      }
    }

    group.position.set(
      toRenderX(bounds.center.x, scene),
      toRenderY(bounds.center.y, scene),
      0,
    );

    return group;
  }

  if (primitive.kind === "transitStop") {
    const height = viewMode === "3d" ? 1.6 : 0.08;
    const group = new Group();
    const pole = new Mesh(
      new CylinderGeometry(primitive.radiusMeters, primitive.radiusMeters, height, 16),
      new MeshBasicMaterial({ color: primitive.color }),
    );
    const shelter = new Mesh(
      new BoxGeometry(primitive.radiusMeters * 2.4, 0.8, height * 0.74),
      new MeshBasicMaterial({ color: "#22d3ee", opacity: 0.7, transparent: true }),
    );

    pole.position.set(0, 0, height / 2);
    shelter.position.set(0, primitive.radiusMeters * 1.08, height * 0.55);
    group.add(pole, shelter);
    group.position.set(
      toRenderX(primitive.position.x, scene),
      toRenderY(primitive.position.y, scene),
      0,
    );

    return group;
  }

  if (primitive.kind === "crosswalk") {
    // Un-oriented flat patch (ADR-0020) — see the render-plan's own comment
    // on why this does not align across its road's direction of travel.
    const mesh = new Mesh(
      new BoxGeometry(primitive.widthMeters, primitive.widthMeters, 0.04),
      new MeshBasicMaterial({ color: primitive.color }),
    );

    mesh.position.set(
      toRenderX(primitive.position.x, scene),
      toRenderY(primitive.position.y, scene),
      0.03,
    );

    return mesh;
  }

  if (primitive.kind === "hazard") {
    const mesh = new Mesh(
      new CylinderGeometry(primitive.radiusMeters, primitive.radiusMeters, 0.06, 32),
      new MeshBasicMaterial({
        color: primitive.color,
        opacity: primitive.opacity,
        transparent: true,
      }),
    );

    mesh.position.set(
      toRenderX(primitive.position.x, scene),
      toRenderY(primitive.position.y, scene),
      0.04,
    );

    return mesh;
  }

  const x1 = toRenderX(primitive.start.x, scene);
  const y1 = toRenderY(primitive.start.y, scene);
  const x2 = toRenderX(primitive.end.x, scene);
  const y2 = toRenderY(primitive.end.y, scene);

  if (primitive.kind === "road") {
    const group = new Group();
    if (viewMode === "3d") {
      // A street, not a neon trace: asphalt, kerb-white edge lines and a dashed
      // centre line. The glowing cyan strips it used to carry looked like a
      // debug overlay drawn over the city.
      group.add(createWetRoadMesh(x1, y1, x2, y2, primitive.widthMeters));
      const length = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / (length || 1);
      const uy = (y2 - y1) / (length || 1);
      const nx = -uy;
      const ny = ux;
      const edge = primitive.widthMeters / 2 - 0.45;
      for (const side of [-1, 1]) {
        group.add(
          createLineLikeMesh(
            x1 + nx * edge * side,
            y1 + ny * edge * side,
            x2 + nx * edge * side,
            y2 + ny * edge * side,
            0.2,
            "#ece9dc",
            0.1,
          ),
        );
      }
      for (let along = 1.5; along < length - 3; along += 7) {
        group.add(
          createLineLikeMesh(
            x1 + ux * along,
            y1 + uy * along,
            x1 + ux * (along + 3.2),
            y1 + uy * (along + 3.2),
            0.24,
            "#ece9dc",
            0.1,
          ),
        );
      }
      return group;
    }
    group.add(
      createLineLikeMesh(x1, y1, x2, y2, primitive.widthMeters, "#2d3b40", 0.09),
    );
    group.add(
      createLineLikeMesh(
        x1,
        y1,
        x2,
        y2,
        Math.max(0.22, primitive.widthMeters * 0.08),
        primitive.color,
        0.16,
        0.88,
      ),
    );
    group.add(
      createLineLikeMesh(
        x1,
        y1,
        x2,
        y2,
        Math.max(0.12, primitive.widthMeters * 0.04),
        "#d9f99d",
        0.18,
        0.46,
      ),
    );
    return group;
  }

  return createLineLikeMesh(
    x1,
    y1,
    x2,
    y2,
    primitive.widthMeters,
    primitive.color,
    0.12,
  );
}

function createWetRoadMesh(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const roadWidth = Math.max(0.2, width);
  // Aggregate under the wet sheen, tiled per metre along the road; a flat
  // colour read as a black strip once the sky started reflecting in it.
  const asphalt = groundTextures()?.asphalt;
  const mesh = new Mesh(
    new BoxGeometry(length, roadWidth, 0.09),
    new MeshPhysicalMaterial({
      clearcoat: 0.48,
      clearcoatRoughness: 0.22,
      color: asphalt ? "#8f969a" : "#333b3e",
      map: asphalt
        ? repeatFor(asphalt, length, roadWidth, groundTileMeters.asphalt)
        : null,
      metalness: 0.05,
      roughness: 0.3,
    }),
  );

  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.09 / 2);
  mesh.rotation.z = Math.atan2(y2 - y1, x2 - x1);
  mesh.receiveShadow = true;

  return mesh;
}

export function createBioCitySceneDressingObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  if (viewMode !== "3d") {
    return [];
  }

  const objects: Object3D[] = [];
  const roadPoints = scene.roads.flatMap((road) => road.geometry.points);
  const dressing = streetDressingPlacements(roadPoints);

  dressing.trees.forEach((tree) => {
    objects.push(createTree(toRenderX(tree.x, scene), toRenderY(tree.y, scene)));
  });
  dressing.lights.forEach((light) => {
    objects.push(
      createStreetLight(toRenderX(light.x, scene), toRenderY(light.y, scene)),
    );
  });

  scene.shops.slice(0, 6).forEach((shop, index) => {
    const marker = new Mesh(
      new BoxGeometry(shop.size.width * 0.82, 0.42, 0.72),
      new MeshBasicMaterial({ color: index % 2 === 0 ? "#f97316" : "#22c55e" }),
    );
    marker.position.set(
      toRenderX(shop.position.x, scene),
      toRenderY(shop.position.y - shop.size.height / 2 - 0.35, scene),
      1.24,
    );
    objects.push(marker);
  });

  return objects;
}

function createTree(x: number, y: number) {
  const group = new Group();
  // Cylinders are Y-axis by default; rotate to stand upright in the z-up scene.
  const trunk = new Mesh(
    new CylinderGeometry(0.18, 0.24, 1.2, 8),
    new MeshStandardMaterial({ color: "#6b4f2a", roughness: 0.9 }),
  );
  trunk.rotation.x = Math.PI / 2;
  const crown = new Mesh(
    new CylinderGeometry(0.2, 1.1, 1.6, 10),
    new MeshStandardMaterial({ color: "#3f8f52", roughness: 0.85 }),
  );
  crown.rotation.x = Math.PI / 2;

  trunk.castShadow = true;
  crown.castShadow = true;
  trunk.position.set(0, 0, 0.6);
  crown.position.set(0, 0, 1.9);
  group.add(trunk, crown);
  group.position.set(x, y, 0);

  return group;
}

function createStreetLight(x: number, y: number) {
  const group = new Group();
  const pole = new Mesh(
    new CylinderGeometry(0.08, 0.1, 2.4, 8),
    new MeshStandardMaterial({ color: "#94a3b8", roughness: 0.5, metalness: 0.3 }),
  );
  pole.rotation.x = Math.PI / 2;
  // Emissive lamp head reads as a lit lamp, glowing against the night scene.
  const lamp = new Mesh(
    new BoxGeometry(0.74, 0.28, 0.18),
    new MeshStandardMaterial({
      color: "#fde68a",
      emissive: "#ffd23a",
      emissiveIntensity: 0.7,
    }),
  );

  pole.castShadow = true;
  pole.position.set(0, 0, 1.2);
  lamp.position.set(0.28, 0, 2.38);
  group.add(pole, lamp);
  group.position.set(x, y, 0);

  return group;
}
export function createBioCityAssetPlaceholder(
  asset: BioCityRenderAssetPlacement,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  const isSceneAsset = asset.kind === "gltf-scene" || asset.kind === "tileset";
  const height = viewMode === "3d" ? (isSceneAsset ? 1.2 : 1.8) : 0.08;
  const footprint = isSceneAsset ? 8 * asset.scale : 2.4 * asset.scale;
  const mesh = new Mesh(
    new BoxGeometry(footprint, footprint, height),
    new MeshBasicMaterial({
      color: isSceneAsset ? "#94a3b8" : "#f59e0b",
      opacity: isSceneAsset ? 0.2 : 0.72,
      transparent: true,
    }),
  );

  mesh.name = asset.id;
  mesh.position.set(
    toRenderX(asset.anchor.x, scene),
    toRenderY(asset.anchor.y, scene),
    asset.anchor.z + height / 2,
  );
  mesh.rotation.z = (asset.rotationDegrees * Math.PI) / 180;

  return mesh;
}

export function createLineLikeMesh(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  height: number,
  opacity?: number,
) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const geometry = new BoxGeometry(length, Math.max(0.2, width), height);
  const material = new MeshBasicMaterial(
    opacity === undefined
      ? { color }
      : {
          color,
          opacity,
          transparent: true,
        },
  );
  const mesh = new Mesh(geometry, material);

  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, height / 2);
  mesh.rotation.z = Math.atan2(y2 - y1, x2 - x1);

  return mesh;
}
