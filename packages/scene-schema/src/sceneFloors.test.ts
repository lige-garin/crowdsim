import { describe, expect, it } from "vitest";
import { parseScene, safeParseScene } from "./index";
import { baseFloorId, resolveFloorId, sceneFloors, sceneOnFloor } from "./sceneFloors";
import { validScene } from "./sceneTestFixtures";

const twoFloorScene = {
  ...validScene,
  floors: [
    { id: "level-1", name: "Ground", level: 0 },
    { id: "level-2", name: "First", level: 1, elevationMeters: 5.4 },
  ],
  walls: [
    { ...validScene.walls[0], id: "ground-wall" },
    { ...validScene.walls[0], id: "upper-wall", floorId: "level-2" },
  ],
  shops: [
    {
      id: "upper-shop",
      floorId: "level-2",
      position: { x: 20, y: 20 },
      size: { width: 6, height: 6 },
    },
  ],
  brandProfiles: [{ id: "a-brand", name: "A Brand", category: "fastFashion" }],
};

describe("scene floors", () => {
  it("treats a scene with no floors as one floor that everything is on", () => {
    const scene = parseScene(validScene);

    expect(sceneFloors(scene)).toEqual([]);
    expect(baseFloorId(scene)).toBeUndefined();
    expect(resolveFloorId(scene, { floorId: undefined })).toBeUndefined();
  });

  it("orders floors by level, lowest first, whatever order they are written in", () => {
    const scene = parseScene({
      ...twoFloorScene,
      floors: [
        { id: "level-2", level: 1 },
        { id: "basement", level: -1 },
        { id: "level-1", level: 0 },
      ],
      walls: [validScene.walls[0]],
      shops: [],
    });

    expect(sceneFloors(scene).map((floor) => floor.id)).toEqual([
      "basement",
      "level-1",
      "level-2",
    ]);
    expect(baseFloorId(scene)).toBe("basement");
  });

  it("puts a primitive with no floor on the base floor", () => {
    const scene = parseScene(twoFloorScene);

    expect(resolveFloorId(scene, scene.walls[0])).toBe("level-1");
    expect(resolveFloorId(scene, scene.walls[1])).toBe("level-2");
  });

  it("keeps only what is on the floor asked for", () => {
    const scene = parseScene(twoFloorScene);
    const upper = sceneOnFloor(scene, "level-2");

    expect(upper?.walls.map((wall) => wall.id)).toEqual(["upper-wall"]);
    expect(upper?.shops.map((shop) => shop.id)).toEqual(["upper-shop"]);
    // The ground floor's entrances are not on this one.
    expect(upper?.entrances).toEqual([]);
  });

  it("keeps the parts of a scene that belong to the run, not to a plane", () => {
    const scene = parseScene(twoFloorScene);
    const upper = sceneOnFloor(scene, "level-2");

    expect(upper?.brandProfiles.map((brand) => brand.id)).toEqual(["a-brand"]);
    expect(upper?.seed).toBe(scene.seed);
  });

  it("uses a floor's own world size when it declares one", () => {
    const scene = parseScene({
      ...twoFloorScene,
      floors: [
        { id: "level-1", level: 0 },
        { id: "level-2", level: 1, world: { width: 40, height: 24 } },
      ],
    });

    expect(sceneOnFloor(scene, "level-1")?.world).toEqual(scene.world);
    expect(sceneOnFloor(scene, "level-2")?.world).toEqual({ width: 40, height: 24 });
  });

  it("returns null for a floor the scene does not have", () => {
    expect(sceneOnFloor(parseScene(twoFloorScene), "roof")).toBeNull();
  });

  it("rejects a scene whose primitive names a floor that is not declared", () => {
    const result = safeParseScene({
      ...validScene,
      floors: [{ id: "level-1", level: 0 }],
      walls: [{ ...validScene.walls[0], floorId: "level-9" }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("level-9");
  });

  it("accepts a scene that declares no floors and stamps no floor ids", () => {
    expect(safeParseScene(validScene).success).toBe(true);
  });
});

describe("connectors between floors", () => {
  const withStairs = (connector: unknown) => ({
    ...validScene,
    floors: [
      { id: "level-1", level: 0 },
      { id: "level-2", level: 1 },
    ],
    connectors: [connector],
  });

  it("accepts a staircase between two declared floors", () => {
    const result = safeParseScene(
      withStairs({
        id: "stair-1",
        kind: "stair",
        from: { floorId: "level-1", point: { x: 10, y: 10 } },
        to: { floorId: "level-2", point: { x: 10, y: 10 } },
      }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.connectors[0].width).toBe(1.2);
    expect(result.data?.connectors[0].bidirectional).toBe(false);
  });

  it("rejects one that joins a floor the scene does not declare", () => {
    const result = safeParseScene(
      withStairs({
        id: "stair-1",
        kind: "stair",
        from: { floorId: "level-1", point: { x: 10, y: 10 } },
        to: { floorId: "roof", point: { x: 10, y: 10 } },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("roof");
  });

  it("rejects one that starts and ends on the same floor", () => {
    const result = safeParseScene(
      withStairs({
        id: "stair-1",
        kind: "stair",
        from: { floorId: "level-1", point: { x: 10, y: 10 } },
        to: { floorId: "level-1", point: { x: 20, y: 20 } },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("same floor");
  });

  it("accepts a lift between two declared floors, with its own capacity/car/door defaults", () => {
    const result = safeParseScene(
      withStairs({
        id: "lift-1",
        kind: "elevator",
        from: { floorId: "level-1", point: { x: 10, y: 10 } },
        to: { floorId: "level-2", point: { x: 10, y: 10 } },
      }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.connectors[0].capacity).toBe(8);
    expect(result.data?.connectors[0].carCount).toBe(1);
    expect(result.data?.connectors[0].doorSeconds).toBe(4);
  });
});

describe("who the crowd is", () => {
  const withPopulation = (population: unknown) => ({
    ...validScene,
    population,
  });

  it("accepts a mix whose shares add up", () => {
    const result = safeParseScene(
      withPopulation({
        name: "Half and half",
        mix: [
          { profileId: "male-over-50", share: 0.5 },
          { profileId: "female-over-50", share: 0.5 },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects a mix that leaves part of the crowd unaccounted for", () => {
    const result = safeParseScene(
      withPopulation({ mix: [{ profileId: "male-over-50", share: 0.5 }] }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("not 1");
  });

  it("rejects a mix that names the same profile twice", () => {
    const result = safeParseScene(
      withPopulation({
        mix: [
          { profileId: "male-over-50", share: 0.5 },
          { profileId: "male-over-50", share: 0.5 },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("twice");
  });

  it("lets a door bring its own crowd, and a scene say nothing at all", () => {
    expect(safeParseScene(validScene).success).toBe(true);
    expect(
      safeParseScene({
        ...validScene,
        entrances: validScene.entrances.map((entrance) => ({
          ...entrance,
          population: { mix: [{ profileId: "crew-male", share: 1 }] },
        })),
      }).success,
    ).toBe(true);
  });
});
