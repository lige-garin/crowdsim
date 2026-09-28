import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Object3D,
} from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { BoxBatch } from "./boxBatch";
import type { Rect } from "../viewport/cityLayout";

/**
 * Shops you can recognise as shops.
 *
 * A store used to be a brand-coloured floor, two grey boxes and a coloured bar
 * "over the shopfront, no text", with its front assumed to face one fixed way.
 * Now each store has a glazed front on the side its entrance is on, with a
 * door opening where the entrance is, mullions, a fascia, and a sign with the
 * shop's name that glows after dark. Shelving stands against the back wall.
 *
 * All signs share one texture atlas and one mesh, and all glass and all frames
 * share a batch each, so a street of shops stays a handful of draw calls.
 */
type RenderRect = { x0: number; x1: number; y0: number; y1: number };
type Render = (rect: Rect) => RenderRect;

const shopCategoryColour: Record<string, string> = {
  anchor: "#5b7fa6",
  coffee: "#9a6a44",
  cosmetics: "#d88cb5",
  dining: "#e0913f",
  electronics: "#4f7fd1",
  entertainment: "#8b6fd6",
  family: "#6fb35f",
  fastFashion: "#d9695f",
  grocery: "#5fa55a",
  jewelry: "#caa53d",
  luxury: "#3f3a52",
  restaurant: "#c9603a",
  service: "#4aa7a3",
};

const DOOR_WIDTH = 2.4;
const DOOR_HEIGHT = 2.5;
const GLASS_TOP = 3.1;
const FASCIA_BOTTOM = 3.2;
const FASCIA_TOP = 4.1;
const MULLION_SPACING = 1.6;
const SIGN_ROW_PIXELS = 96;
const MAX_SIGNS = 64;

type ShopSide = "north" | "south" | "east" | "west";

/**
 * Which side of the shop faces its entrance, in scene terms (+y is south).
 * With no entrance the front is the south side, as before.
 */
function shopFrontSide(shop: CrowdSimScene["shops"][number]): ShopSide {
  const door = shop.entrancePosition;
  if (!door) return "south";
  const dx = (door.x - shop.position.x) / Math.max(0.01, shop.size.width);
  const dy = (door.y - shop.position.y) / Math.max(0.01, shop.size.height);
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? "south" : "north";
  return dx >= 0 ? "east" : "west";
}

export function createShopFronts(scene: CrowdSimScene, render: Render): Object3D[] {
  const floors = new BoxBatch();
  const fittings = new BoxBatch();
  const frames = new BoxBatch();
  const glass = new BoxBatch();
  const white = new Color("#ffffff");
  const frameColour = new Color("#3b4046");
  const counterTop = new Color("#f5f1e8");
  const shelf = new Color("#8a8f95");
  const signs: { name: string; colour: string; quad: number[] }[] = [];

  for (const shop of scene.shops) {
    const r = render({
      maxX: shop.position.x + shop.size.width / 2,
      maxY: shop.position.y + shop.size.height / 2,
      minX: shop.position.x - shop.size.width / 2,
      minY: shop.position.y - shop.size.height / 2,
    });
    const colourHex = shopCategoryColour[shop.brand?.category ?? ""] ?? "#b58a5b";
    const brand = new Color(colourHex);
    floors.box(r.x0, r.x1, r.y0, r.y1, 0.05, 0.09, brand, { sides: false, top: true });

    // Scene south (+y) is render -y: the render rectangle's y0 edge.
    const side = shopFrontSide(shop);
    const alongX = side === "south" || side === "north";
    const edge =
      side === "south" ? r.y0 : side === "north" ? r.y1 : side === "east" ? r.x1 : r.x0;
    const outward = side === "south" || side === "west" ? -1 : 1;
    const from = alongX ? r.x0 : r.y0;
    const to = alongX ? r.x1 : r.y1;
    const doorScene = shop.entrancePosition ?? shop.position;
    const doorCentre = alongX
      ? doorScene.x - scene.world.width / 2
      : scene.world.height / 2 - doorScene.y;
    const doorFrom = Math.max(
      from + 0.3,
      Math.min(to - 0.3 - DOOR_WIDTH, doorCentre - DOOR_WIDTH / 2),
    );
    const doorTo = doorFrom + DOOR_WIDTH;

    // A box along the front edge between `a` and `b` (along), from z0 to z1,
    // `depth` thick, set `offset` outward from the edge.
    const frontBox = (
      batch: BoxBatch,
      a: number,
      b: number,
      z0: number,
      z1: number,
      depth: number,
      offset: number,
      colour: Color,
    ) => {
      const c0 = edge + outward * (offset - depth / 2);
      const c1 = edge + outward * (offset + depth / 2);
      const [n0, n1] = c0 < c1 ? [c0, c1] : [c1, c0];
      if (alongX) batch.box(a, b, n0, n1, z0, z1, colour, { sides: true, top: true });
      else batch.box(n0, n1, a, b, z0, z1, colour, { sides: true, top: true });
    };

    // Glass either side of the door, a transom over it.
    if (doorFrom - from > 0.05)
      frontBox(glass, from, doorFrom, 0.09, GLASS_TOP, 0.05, 0, white);
    if (to - doorTo > 0.05)
      frontBox(glass, doorTo, to, 0.09, GLASS_TOP, 0.05, 0, white);
    frontBox(glass, doorFrom, doorTo, DOOR_HEIGHT, GLASS_TOP, 0.05, 0, white);
    // Mullions, door jambs, the head over the door, a sill.
    for (let at = from; at <= to + 0.01; at += MULLION_SPACING) {
      if (at > doorFrom - 0.05 && at < doorTo + 0.05) continue;
      frontBox(frames, at - 0.05, at + 0.05, 0.09, GLASS_TOP, 0.12, 0, frameColour);
    }
    for (const jamb of [doorFrom, doorTo]) {
      frontBox(frames, jamb - 0.07, jamb + 0.07, 0.09, GLASS_TOP, 0.14, 0, frameColour);
    }
    frontBox(
      frames,
      doorFrom,
      doorTo,
      DOOR_HEIGHT - 0.08,
      DOOR_HEIGHT,
      0.14,
      0,
      frameColour,
    );
    frontBox(frames, from, to, GLASS_TOP, FASCIA_BOTTOM, 0.16, 0, frameColour);
    // The fascia the sign hangs on, in the brand colour.
    frontBox(fittings, from, to, FASCIA_BOTTOM, FASCIA_TOP, 0.3, 0.15, brand);

    // Shelving along the back wall, a counter just inside the door.
    const backEdge =
      side === "south" ? r.y1 : side === "north" ? r.y0 : side === "east" ? r.x0 : r.x1;
    const inward = -outward;
    const shelfA = backEdge - inward * 0.9;
    const shelfB = backEdge - inward * 0.3;
    const counterA = edge + inward * 1.2;
    const counterB = edge + inward * 1.9;
    const mid = (doorFrom + doorTo) / 2;
    // A box spanning `a0..a1` along the front and `c0..c1` across it.
    const put = (
      a0: number,
      a1: number,
      c0: number,
      c1: number,
      z1: number,
      colour: Color,
    ) => {
      const [n0, n1] = c0 < c1 ? [c0, c1] : [c1, c0];
      const faces = { sides: true, top: true };
      if (alongX) fittings.box(a0, a1, n0, n1, 0.09, z1, colour, faces);
      else fittings.box(n0, n1, a0, a1, 0.09, z1, colour, faces);
    };
    put(from + 0.4, to - 0.4, shelfA, shelfB, 1.9, shelf);
    put(mid - 1.4, mid + 1.4, counterA, counterB, 1.05, counterTop);

    // The sign: a quad on the fascia's outer face, reading left to right from
    // outside. Viewed from outside, "right" is (-n.y, n.x) for outward normal n.
    const face = edge + outward * 0.31;
    const inset = Math.min(0.5, (to - from) * 0.1);
    const [left, right] = alongX
      ? outward < 0
        ? [from + inset, to - inset]
        : [to - inset, from + inset]
      : outward < 0
        ? [to - inset, from + inset]
        : [from + inset, to - inset];
    const point = (along: number, z: number) =>
      alongX ? [along, face, z] : [face, along, z];
    signs.push({
      colour: colourHex,
      name: shop.name ?? shop.brand?.profileId ?? shop.id,
      quad: [
        ...point(left, FASCIA_BOTTOM + 0.1),
        ...point(right, FASCIA_BOTTOM + 0.1),
        ...point(right, FASCIA_TOP - 0.1),
        ...point(left, FASCIA_TOP - 0.1),
      ],
    });
  }

  const objects: Object3D[] = [
    floors.toMesh(
      new MeshStandardMaterial({ roughness: 0.7, vertexColors: true }),
      "district-shop-floors",
      false,
    ),
    fittings.toMesh(
      new MeshStandardMaterial({ roughness: 0.6, vertexColors: true }),
      "district-shop-fittings",
    ),
    frames.toMesh(
      new MeshStandardMaterial({ metalness: 0.6, roughness: 0.4, vertexColors: true }),
      "district-shop-frames",
    ),
  ];
  const glassMesh = glass.toMesh(
    new MeshStandardMaterial({
      color: "#a9cfdc",
      depthWrite: false,
      metalness: 0.1,
      opacity: 0.28,
      roughness: 0.04,
      side: DoubleSide,
      transparent: true,
    }),
    "district-shop-glass",
    false,
  );
  glassMesh.renderOrder = 3;
  objects.push(glassMesh);
  const signMesh = createSignMesh(signs.slice(0, MAX_SIGNS));
  if (signMesh) objects.push(signMesh);
  return objects;
}

/** One mesh of sign quads textured from a shared atlas; null without a 2D canvas. */
function createSignMesh(signs: { name: string; colour: string; quad: number[] }[]) {
  if (signs.length === 0 || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  canvas.width = 512;
  canvas.height = SIGN_ROW_PIXELS * signs.length;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  signs.forEach((sign, row) => {
    const top = row * SIGN_ROW_PIXELS;
    context.fillStyle = new Color(sign.colour).multiplyScalar(0.55).getStyle();
    context.fillRect(0, top, canvas.width, SIGN_ROW_PIXELS);
    context.strokeStyle = "rgba(255,255,255,0.55)";
    context.lineWidth = 4;
    context.strokeRect(6, top + 6, canvas.width - 12, SIGN_ROW_PIXELS - 12);
    const font = (px: number) =>
      `700 ${px}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
    let fontSize = 52;
    context.font = font(fontSize);
    while (context.measureText(sign.name).width > canvas.width - 48 && fontSize > 20) {
      fontSize -= 2;
      context.font = font(fontSize);
    }
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(sign.name, canvas.width / 2, top + SIGN_ROW_PIXELS / 2 + 2);

    // Canvas row 0 is the texture's top (v = 1).
    const v1 = 1 - row / signs.length;
    const v0 = 1 - (row + 1) / signs.length;
    const base = positions.length / 3;
    positions.push(...sign.quad);
    uvs.push(0, v0, 1, v0, 1, v1, 0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    emissive: "#ffffff",
    emissiveIntensity: 0.3,
    emissiveMap: texture,
    map: texture,
    roughness: 0.5,
  });
  // Tells the city's night ramp to light it (see cityMeshes.setNightLevel).
  material.userData.signGlow = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = "district-shop-signs";
  mesh.receiveShadow = true;
  return mesh;
}
