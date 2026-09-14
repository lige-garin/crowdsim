import {
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  createCityLayout,
  type CityBuilding,
  type CityBuildingStyle,
  type CityLayout,
  type Rect,
} from "./cityLayout";
import { BoxBatch } from "./boxBatch";
import { cityTextures, TILE_BAYS, TILE_FLOORS } from "./cityTextures";
import { createDistrictObjects, sceneRectToRender } from "./districtMeshes";
import { groundTextures, groundTileMeters, repeatFor } from "./groundTextures";

/**
 * The 3D city as a handful of draw calls.
 *
 * Every generated building merges into one of three geometries — curtain-wall
 * facades, masonry facades, roofs — with per-building tint in vertex colour and
 * windows in a tiled texture. Trees and lamps are instanced. A city of several
 * hundred buildings is ~10 draw calls, where the previous renderer spent one
 * Mesh per window pane on a dozen boxes.
 *
 * Scene coordinates are y-down metres; render space is z-up, centred on the
 * district, matching `toRenderX` / `toRenderY` so the crowd lines up.
 */
type RenderRect = { x0: number; x1: number; y0: number; y1: number };

export type CityObjects = {
  /** Everything to add to the scene. */
  objects: Object3D[];
  /** Night glow for lit windows and lamps, 0 (day) .. 1 (night). */
  setNightLevel: (level: number) => void;
};

const PALETTE: Record<CityBuildingStyle, string[]> = {
  brick: ["#a4604a", "#b06d52", "#955544", "#b97c5f", "#8f5a47"],
  office: ["#dfe3e5", "#cfd6da", "#e7e3da", "#c3ccd2"],
  plaster: ["#f0e4cf", "#e3d2b4", "#f4ece0", "#d8e0d9", "#ead6bf", "#e9dcc8"],
  shopfront: ["#e4cda6", "#d3dccb", "#efdcc2", "#e8c7b5"],
  tower: ["#c3d4df", "#b1c5d2", "#d2dde4", "#a6bccb"],
};
const ROOF = ["#5a5f66", "#666b70", "#4f555c", "#6d6a64"];

export function createCityObjects(scene: CrowdSimScene): CityObjects {
  const layout = createCityLayout(scene);
  const W = scene.world.width;
  const H = scene.world.height;
  const toRect: (rect: Rect) => RenderRect = sceneRectToRender(scene);

  const objects: Object3D[] = [];
  const textures = cityTextures();
  const nightMaterials: MeshStandardMaterial[] = [];

  objects.push(createGround(layout, toRect));
  objects.push(...createPavements(layout, toRect));
  objects.push(createLaneMarkings(layout, W, H));

  // Facades split by texture; roofs share one material.
  const curtain = new BoxBatch();
  const punched = new BoxBatch();
  const roofs = new BoxBatch();
  for (const building of layout.buildings) {
    addBuilding(building, toRect(building.rect), curtain, punched, roofs);
  }
  const facadeMaterial = (set: "curtain" | "punched") => {
    const material = new MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#ffcf8f",
      emissiveIntensity: 0,
      emissiveMap: textures?.[set].emissive ?? null,
      map: textures?.[set].map ?? null,
      metalness: set === "curtain" ? 0.25 : 0.02,
      roughness: set === "curtain" ? 0.32 : 0.86,
      vertexColors: true,
    });
    if (textures) nightMaterials.push(material);
    return material;
  };
  objects.push(curtain.toMesh(facadeMaterial("curtain"), "city-facades-curtain"));
  objects.push(punched.toMesh(facadeMaterial("punched"), "city-facades-punched"));
  objects.push(
    roofs.toMesh(
      new MeshStandardMaterial({ roughness: 0.92, vertexColors: true }),
      "city-roofs",
    ),
  );

  const district = createDistrictObjects(scene);
  objects.push(...district);
  for (const object of district) {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
      if (object.material.userData.signGlow) nightMaterials.push(object.material);
    }
  }
  objects.push(...createTrees(layout, W, H));
  const lamps = createLamps(layout, W, H);
  objects.push(...lamps.objects);
  nightMaterials.push(lamps.glow);

  return {
    objects,
    setNightLevel(level) {
      for (const material of nightMaterials) {
        material.emissiveIntensity =
          material === lamps.glow
            ? 0.2 + level * 2.2
            : material.userData.signGlow
              ? 0.3 + level * 1.1
              : level * 1.4;
      }
    },
  };
}

// ── ground ─────────────────────────────────────────────────────────────────

function createGround(layout: CityLayout, toRect: (rect: Rect) => RenderRect) {
  const group = new Group();
  group.name = "city-ground";
  const span = Math.max(
    layout.bounds.maxX - layout.bounds.minX,
    layout.bounds.maxY - layout.bounds.minY,
  );

  // Countryside to the horizon so the city does not end at a cliff.
  const ground = groundTextures();
  const grass = new Mesh(
    new PlaneGeometry(span * 6, span * 6),
    new MeshStandardMaterial(
      ground
        ? {
            map: repeatFor(ground.grass, span * 6, span * 6, groundTileMeters.grass),
            roughness: 1,
          }
        : { color: "#7d9f5f", roughness: 1 },
    ),
  );
  grass.position.z = -0.12;
  grass.receiveShadow = true;

  // Asphalt under the whole city: streets are simply what blocks do not cover.
  const b = toRect(layout.bounds);
  const asphalt = new Mesh(
    new PlaneGeometry(b.x1 - b.x0, b.y1 - b.y0),
    new MeshStandardMaterial(
      ground
        ? {
            map: repeatFor(
              ground.asphalt,
              b.x1 - b.x0,
              b.y1 - b.y0,
              groundTileMeters.asphalt,
            ),
            roughness: 0.88,
          }
        : { color: "#474c52", roughness: 0.9 },
    ),
  );
  asphalt.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, -0.06);
  asphalt.receiveShadow = true;

  group.add(grass, asphalt);
  return group;
}

function createPavements(layout: CityLayout, toRect: (rect: Rect) => RenderRect) {
  const kerb = new BoxBatch();
  const lawns = new BoxBatch();
  const pavement = new Color("#bdb9b0");
  const lawn = new Color("#83ae62");

  for (const block of layout.blocks) {
    const r = toRect(block.rect);
    kerb.box(r.x0, r.x1, r.y0, r.y1, 0, 0.16, pavement, { top: true, sides: true });
    if (block.use === "park") {
      lawns.box(r.x0 + 2, r.x1 - 2, r.y0 + 2, r.y1 - 2, 0.16, 0.2, lawn, {
        top: true,
        sides: false,
      });
    }
  }

  // The district is a paved plaza, flush with the street so scene roads and
  // the crowd sit on it without a step.
  const d = toRect(layout.district);
  const plazaWidth = d.x1 - d.x0 + 6;
  const plazaDepth = d.y1 - d.y0 + 6;
  const paving = groundTextures()?.paving;
  const plaza = new Mesh(
    new PlaneGeometry(plazaWidth, plazaDepth),
    new MeshStandardMaterial(
      paving
        ? {
            map: repeatFor(paving, plazaWidth, plazaDepth, groundTileMeters.paving),
            roughness: 0.9,
          }
        : { color: "#d2cdc1", roughness: 0.94 },
    ),
  );
  plaza.position.set((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 0.005);
  plaza.receiveShadow = true;
  plaza.name = "city-plaza";

  return [
    kerb.toMesh(
      new MeshStandardMaterial({ roughness: 0.95, vertexColors: true }),
      "city-pavements",
    ),
    lawns.toMesh(
      new MeshStandardMaterial({ roughness: 1, vertexColors: true }),
      "city-lawns",
    ),
    plaza,
  ];
}

function createLaneMarkings(layout: CityLayout, W: number, H: number) {
  const marks = new BoxBatch();
  const paint = new Color("#e9e6d8");
  for (const street of layout.streets) {
    const horizontal = street.from.y === street.to.y;
    const length = horizontal
      ? street.to.x - street.from.x
      : street.to.y - street.from.y;
    for (let along = 2; along < length - 2; along += 7) {
      const sx = horizontal ? street.from.x + along : street.from.x;
      const sy = horizontal ? street.from.y : street.from.y + along;
      if (sx > -4 && sx < W + 4 && sy > -4 && sy < H + 4) continue; // not across the district
      const x = sx - W / 2;
      const y = H / 2 - sy;
      if (horizontal)
        marks.box(x, x + 3.2, y - 0.12, y + 0.12, -0.05, -0.04, paint, {
          top: true,
          sides: false,
        });
      else
        marks.box(x - 0.12, x + 0.12, y - 3.2, y, -0.05, -0.04, paint, {
          top: true,
          sides: false,
        });
    }
  }
  return marks.toMesh(
    new MeshStandardMaterial({ roughness: 0.7, vertexColors: true }),
    "city-lane-markings",
    false,
  );
}

// ── buildings ──────────────────────────────────────────────────────────────

function addBuilding(
  building: CityBuilding,
  r: RenderRect,
  curtain: BoxBatch,
  punched: BoxBatch,
  roofs: BoxBatch,
) {
  const palette = PALETTE[building.style];
  const tint = new Color(
    palette[Math.floor(building.tint * palette.length) % palette.length],
  );
  const glassy = building.style === "tower" || building.style === "office";
  const facade = glassy ? curtain : punched;
  const top = building.heightMeters + 0.16;
  const bay = glassy ? 3 : 3.4;
  const storey = (building.heightMeters - 1.2) / Math.max(1, building.floors);

  facade.box(r.x0, r.x1, r.y0, r.y1, 0.16, top, tint, {
    sides: true,
    top: false,
    uv: { u: 1 / (bay * TILE_BAYS), v: 1 / (storey * TILE_FLOORS) },
  });

  const roofColor = new Color(ROOF[Math.floor(building.tint * 97) % ROOF.length]);
  // Parapet cap, slightly proud of the facade.
  roofs.box(
    r.x0 - 0.25,
    r.x1 + 0.25,
    r.y0 - 0.25,
    r.y1 + 0.25,
    top,
    top + 0.55,
    roofColor,
    { sides: true, top: true },
  );

  // Towers step back once, so the skyline is not a field of extruded rectangles.
  if (building.style === "tower" && building.floors > 16) {
    const inset = Math.min(r.x1 - r.x0, r.y1 - r.y0) * 0.18;
    const crown = top + 0.55 + building.heightMeters * 0.18;
    curtain.box(
      r.x0 + inset,
      r.x1 - inset,
      r.y0 + inset,
      r.y1 - inset,
      top + 0.55,
      crown,
      tint,
      {
        sides: true,
        top: false,
        uv: { u: 1 / (bay * TILE_BAYS), v: 1 / (storey * TILE_FLOORS) },
      },
    );
    roofs.box(
      r.x0 + inset - 0.2,
      r.x1 - inset + 0.2,
      r.y0 + inset - 0.2,
      r.y1 - inset + 0.2,
      crown,
      crown + 0.5,
      roofColor,
      { sides: true, top: true },
    );
  }

  const unitColor = new Color("#8d9296");
  for (const unit of building.roofUnits) {
    const u = {
      x0: r.x0 + (unit.minX - building.rect.minX),
      x1: r.x0 + (unit.maxX - building.rect.minX),
      y0: r.y1 - (unit.maxY - building.rect.minY),
      y1: r.y1 - (unit.minY - building.rect.minY),
    };
    roofs.box(u.x0, u.x1, u.y0, u.y1, top + 0.55, top + 0.55 + 1.4, unitColor, {
      sides: true,
      top: true,
    });
  }

  // Shopfronts get a canopy over the pavement edge.
  if (building.style === "shopfront") {
    const awning = new Color(
      ["#c2410c", "#0f766e", "#1d4ed8", "#a16207"][Math.floor(building.tint * 41) % 4],
    );
    roofs.box(r.x0, r.x1, r.y0 - 1.6, r.y0, 3, 3.25, awning, {
      sides: true,
      top: true,
    });
  }
}

// ── props ──────────────────────────────────────────────────────────────────

function createTrees(layout: CityLayout, W: number, H: number) {
  const count = layout.trees.length;
  if (count === 0) return [];
  const trunkGeometry = new CylinderGeometry(0.16, 0.24, 2.2, 6)
    .rotateX(Math.PI / 2)
    .translate(0, 0, 1.1);
  const crownGeometry = new IcosahedronGeometry(1.7, 0).translate(0, 0, 3.4);
  const trunks = new InstancedMesh(
    trunkGeometry,
    new MeshStandardMaterial({ color: "#6b5238", roughness: 1 }),
    count,
  );
  const crowns = new InstancedMesh(
    crownGeometry,
    new MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
    count,
  );
  const matrix = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 0, 1);
  const greens = ["#4f7d3a", "#5c8c43", "#6a9a4c", "#437034", "#7aa656"].map(
    (hex) => new Color(hex),
  );

  layout.trees.forEach((tree, index) => {
    q.setFromAxisAngle(up, tree.rotation);
    matrix.compose(
      new Vector3(tree.x - W / 2, H / 2 - tree.y, 0),
      q,
      new Vector3(tree.scale, tree.scale, tree.scale),
    );
    trunks.setMatrixAt(index, matrix);
    crowns.setMatrixAt(index, matrix);
    crowns.setColorAt(index, greens[index % greens.length]);
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  trunks.name = "city-tree-trunks";
  crowns.name = "city-tree-crowns";
  return [trunks, crowns];
}

function createLamps(layout: CityLayout, W: number, H: number) {
  const count = layout.lamps.length;
  const glow = new MeshStandardMaterial({
    color: "#fff3cf",
    emissive: "#ffd89a",
    emissiveIntensity: 0.2,
  });
  if (count === 0) return { glow, objects: [] as Object3D[] };
  const poleGeometry = new CylinderGeometry(0.07, 0.09, 5.2, 5)
    .rotateX(Math.PI / 2)
    .translate(0, 0, 2.6);
  const headGeometry = new CylinderGeometry(0.28, 0.18, 0.22, 6)
    .rotateX(Math.PI / 2)
    .translate(0.9, 0, 5.2);
  const poles = new InstancedMesh(
    poleGeometry,
    new MeshStandardMaterial({ color: "#394048", metalness: 0.5, roughness: 0.5 }),
    count,
  );
  const heads = new InstancedMesh(headGeometry, glow, count);
  const matrix = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 0, 1);
  const one = new Vector3(1, 1, 1);
  layout.lamps.forEach((lamp, index) => {
    q.setFromAxisAngle(up, lamp.rotation);
    matrix.compose(new Vector3(lamp.x - W / 2, H / 2 - lamp.y, 0), q, one);
    poles.setMatrixAt(index, matrix);
    heads.setMatrixAt(index, matrix);
  });
  poles.name = "city-lamp-poles";
  heads.name = "city-lamp-heads";
  return { glow, objects: [poles, heads] as Object3D[] };
}
