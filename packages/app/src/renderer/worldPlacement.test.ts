import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "../defaultDemoScene";
import { placeEditorTool, createEditorDocumentFromScene } from "../sceneEditorState";
import {
  placeInScene,
  placementConflict,
  placementFootprint,
  placesInWorld,
  scenePointAtScreen,
} from "./worldPlacement";

const rect = { height: 600, left: 0, top: 0, width: 800 };

function topDownCamera(renderX: number, renderY: number) {
  const camera = new PerspectiveCamera(40, rect.width / rect.height, 0.5, 2600);
  camera.up.set(0, 1, 0);
  camera.position.set(renderX, renderY, 200);
  camera.lookAt(renderX, renderY, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe("scenePointAtScreen", () => {
  const world = defaultDemoScene.world;

  it("maps the screen centre to the ground point under the camera, in scene metres", () => {
    // Render (0,0) is the world centre; render +y is scene −y.
    const camera = topDownCamera(10, 20);
    const point = scenePointAtScreen(camera, rect, 400, 300, world);
    expect(point).toEqual({ x: world.width / 2 + 10, y: world.height / 2 - 20 });
  });

  it("snaps to the editor grid", () => {
    const camera = topDownCamera(0.7, 0.3);
    const point = scenePointAtScreen(camera, rect, 400, 300, world)!;
    expect(point.x % 2).toBe(0);
    expect(point.y % 2).toBe(0);
  });

  it("refuses points outside the simulated world", () => {
    const camera = topDownCamera(world.width, 0);
    expect(scenePointAtScreen(camera, rect, 400, 300, world)).toBeNull();
  });

  it("refuses a ray that never reaches the ground", () => {
    const camera = new PerspectiveCamera(40, rect.width / rect.height, 0.5, 2600);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 100);
    camera.updateMatrixWorld();
    expect(scenePointAtScreen(camera, rect, 400, 300, world)).toBeNull();
  });
});

describe("placeInScene", () => {
  const at = { x: 40, y: 86 };

  it("adds what the 2D editor would add for the same click", () => {
    const next = placeInScene(defaultDemoScene, "building", at)!;
    expect(next.buildings).toHaveLength(defaultDemoScene.buildings.length + 1);
    const expected = placeEditorTool(
      createEditorDocumentFromScene(defaultDemoScene),
      "building",
      at,
    )!;
    expect(next.buildings.at(-1)!.id).toBe(expected.buildings.at(-1)!.id);
  });

  it("never reuses an existing id", () => {
    const next = placeInScene(defaultDemoScene, "shop", at)!;
    const ids = next.shops.map((shop) => shop.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("can place again on a scene it already placed into", () => {
    // Regression: the lifted document restarted ids at 1, so the second shop
    // was a duplicate `shop-1` and the schema threw.
    const once = placeInScene(defaultDemoScene, "shop", at)!;
    const twice = placeInScene(once, "shop", { x: 60, y: 86 })!;
    const ids = twice.shops.map((shop) => shop.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(twice.shops).toHaveLength(defaultDemoScene.shops.length + 2);
  });

  it("keeps the rest of the scene intact", () => {
    const next = placeInScene(defaultDemoScene, "road", at)!;
    expect(next.roads).toHaveLength(defaultDemoScene.roads.length + 1);
    expect(next.shops).toHaveLength(defaultDemoScene.shops.length);
    expect(next.world).toEqual(defaultDemoScene.world);
  });

  it("refuses to place onto something solid", () => {
    expect(placeInScene(defaultDemoScene, "building", { x: 80, y: 54 })).toBeNull();
  });

  it("does nothing for tools that are not one click", () => {
    expect(placesInWorld("select")).toBe(false);
    expect(placesInWorld("wall")).toBe(false);
    expect(placeInScene(defaultDemoScene, "wall", at)).toBeNull();
    expect(placesInWorld("road")).toBe(true);
  });
});

describe("placementConflict", () => {
  // Demo geometry: Rain Market Avenue runs y=54, x 8→152, 10 m wide.
  // Glass Arcade spans x 22–64, y 16–40 and holds shops at (36,34) and (50,30).
  const scene = defaultDemoScene;

  it("keeps a building off a road", () => {
    expect(placementConflict(scene, "building", { x: 80, y: 54 })).toBe(
      "rain-market-avenue",
    );
    // Near the kerb but clear of the 5 m half-width plus its own 5 m half-depth.
    expect(placementConflict(scene, "building", { x: 140, y: 88 })).toBeNull();
  });

  it("keeps a building off another building", () => {
    expect(placementConflict(scene, "building", { x: 30, y: 20 })).toBe("glass-arcade");
  });

  it("lets a shop go inside a building but not on top of another shop", () => {
    expect(placementConflict(scene, "shop", { x: 28, y: 22 })).toBeNull();
    expect(placementConflict(scene, "shop", { x: 36, y: 34 })).toMatch(/.+/);
  });

  it("lets roads meet at a junction but not run through a building", () => {
    expect(placementConflict(scene, "road", { x: 80, y: 54 })).toBeNull();
    expect(placementConflict(scene, "road", { x: 90, y: 30 })).toBe("food-hall-south");
  });

  it("never blocks annotations and markers", () => {
    for (const tool of ["zone", "source", "sink", "counter", "hazard"] as const) {
      expect(placementConflict(scene, tool, { x: 36, y: 34 })).toBeNull();
    }
  });

  it("does not treat the inside of a loop road as paved", () => {
    const loop = {
      ...scene,
      roads: [
        {
          ...scene.roads[0],
          id: "ring",
          geometry: {
            type: "polyline" as const,
            points: [
              { x: 100, y: 60 },
              { x: 150, y: 60 },
              { x: 150, y: 94 },
              { x: 100, y: 94 },
              { x: 100, y: 60 },
            ],
          },
          widthMeters: 4,
        },
      ],
    };
    expect(placementConflict(loop, "building", { x: 125, y: 77 })).toBeNull();
  });

  it("uses the footprint the adders really create", () => {
    // The ghost and the conflict test both size from placementFootprint; if an
    // adder's default size changes, this is what catches the drift.
    for (const tool of ["building", "shop", "road", "zone"] as const) {
      const before = createEditorDocumentFromScene(scene);
      const after = placeEditorTool(before, tool, { x: 0, y: 0 })!;
      const size = placementFootprint(tool);
      const points =
        tool === "shop"
          ? [
              {
                x: -after.shops.at(-1)!.size.width / 2,
                y: -after.shops.at(-1)!.size.height / 2,
              },
              {
                x: after.shops.at(-1)!.size.width / 2,
                y: after.shops.at(-1)!.size.height / 2,
              },
            ]
          : tool === "building"
            ? after.buildings.at(-1)!.points
            : tool === "zone"
              ? after.zones.at(-1)!.points
              : after.roads.at(-1)!.points;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const depth =
        tool === "road"
          ? after.roads.at(-1)!.widthMeters
          : Math.max(...ys) - Math.min(...ys);
      expect({ tool, width, depth }).toEqual({
        tool,
        width: size.width,
        depth: size.depth,
      });
    }
  });
});

describe("placementConflict symmetry", () => {
  it("keeps a barrier out of a building, as a building is kept off a barrier", () => {
    // Glass Arcade spans x 22–64, y 16–40.
    expect(placementConflict(defaultDemoScene, "obstacle", { x: 40, y: 28 })).toBe(
      "glass-arcade",
    );
  });

  it("still lets a barrier close a road", () => {
    expect(
      placementConflict(defaultDemoScene, "obstacle", { x: 80, y: 54 }),
    ).toBeNull();
  });
});
