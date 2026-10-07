import { describe, expect, it } from "vitest";
import { safeParseScene } from "@crowdsim/scene-schema";
import { sceneForNewProject } from "./sceneForNewProject";
import type { ProjectDetails } from "./ProjectDetailsForm";

const place = { lat: 41.8057, lng: 123.4315, radiusMeters: 800 };

function details(overrides: Partial<ProjectDetails> = {}): ProjectDetails {
  return {
    areaSquareMeters: 3000,
    businessCategory: "dining",
    floors: 2,
    kind: "mall",
    name: "中街商场",
    planSource: "drawn",
    ...overrides,
  };
}

describe("sceneForNewProject", () => {
  it("carries the site's coordinates on the scene", () => {
    // Nothing in the engine reads these, but an exported scene should still
    // know where its site is without the project record beside it.
    const scene = sceneForNewProject(details(), place);
    const carried = scene.customParameters?.siteLocation as
      | {
          catchmentRadiusMeters: number;
          coordinateSystem: string;
          lat: number;
          lng: number;
        }
      | undefined;

    expect(carried?.lat).toBe(41.8057);
    expect(carried?.lng).toBe(123.4315);
    expect(carried?.catchmentRadiusMeters).toBe(800);
    expect(carried?.coordinateSystem).toBe("GCJ-02");
  });

  it("grows nothing from the area and floor count", () => {
    for (const source of ["drawn", "dxf", "glb"] as const) {
      const scene = sceneForNewProject(details({ planSource: source }), place);

      // A drawn plan does not exist yet, a DXF has not been given to the
      // editor, and a GLB has no walls at all. Walls invented from a floor
      // count would look surveyed and are not.
      expect(scene.walls, `${source} must not invent walls`).toEqual([]);
      expect(scene.storeLots, `${source} must not invent lots`).toEqual([]);
      expect(scene.buildings, `${source} must not invent buildings`).toEqual([]);
    }
  });

  it("sizes the empty world to the footprint so the editor has room to draw", () => {
    const scene = sceneForNewProject(details({ areaSquareMeters: 3000 }), place);
    const area = scene.world.width * scene.world.height;

    // 2:3, and it must actually be big enough to work in.
    expect(scene.world.width).toBeGreaterThan(40);
    expect(scene.world.height).toBeGreaterThan(20);
    expect(area).toBeGreaterThanOrEqual(1500);
  });

  it("generates a real building only when the plan source says to", () => {
    const scene = sceneForNewProject(
      details({ planSource: "skeleton", floors: 3, areaSquareMeters: 6000 }),
      place,
    );

    expect(scene.floors).toHaveLength(3);
    expect(scene.walls.length).toBeGreaterThan(0);
    expect(scene.storeLots.length).toBeGreaterThan(0);
    // Vertical circulation is what the generator adds that a hand-drawn
    // version of the same form would not have.
    expect(scene.connectors?.length ?? 0).toBeGreaterThan(0);
  });

  it("puts the business category on a shop so the engine has one to reason about", () => {
    const scene = sceneForNewProject(details({ businessCategory: "coffee" }), place);

    expect(scene.shops[0]?.brand?.category).toBe("coffee");
  });

  it("produces a scene the schema accepts, for every plan source", () => {
    for (const source of ["drawn", "dxf", "skeleton", "glb"] as const) {
      const built = sceneForNewProject(details({ planSource: source }), place);
      const reparsed = safeParseScene(JSON.parse(JSON.stringify(built)));

      expect(reparsed.success, `${source} produced an unparseable scene`).toBe(true);
    }
  });

  it("gives two projects with the same name different ids only by their plan", () => {
    // Ids come from the name, so two same-named projects collide. That is
    // caught here rather than discovered when one overwrites the other in the
    // project list.
    const drawn = sceneForNewProject(details({ planSource: "drawn" }), place);
    const glb = sceneForNewProject(details({ planSource: "glb" }), place);

    expect(drawn.id).not.toBe(glb.id);
  });
});
