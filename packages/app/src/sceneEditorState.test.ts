import { describe, expect, it } from "vitest";
import {
  addBuilding,
  addCountLine,
  addEntrance,
  addHazard,
  addObstacle,
  addRoad,
  addServicePoint,
  addShop,
  addTarget,
  addTransitStop,
  addWall,
  addZone,
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
  moveEntity,
  removeEntity,
  snapPoint,
} from "./sceneEditorState";
import {
  toggleDocumentZoneWalkable,
  updateDocumentZoneCategory,
  updateDocumentZoneNumber,
} from "./sceneEditorMutations";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { demoScene } from "./demoScene";
import { exampleScenes } from "./exampleScenes";

describe("scene editor state", () => {
  it("creates an editable document from a scene", () => {
    const document = createEditorDocumentFromScene(demoScene);

    expect(document.walls).toHaveLength(1);
    expect(document.entrances).toHaveLength(2);
    expect(document.targets).toHaveLength(1);
  });

  it("snaps points to the configured grid", () => {
    expect(snapPoint({ x: 5.1, y: 6.9 }, 2, true)).toEqual({ x: 6, y: 6 });
    expect(snapPoint({ x: 5.1, y: 6.9 }, 2, false)).toEqual({ x: 5.1, y: 6.9 });
  });

  it("adds walls, entrances, and targets with stable ids", () => {
    let document = createEditorDocumentFromScene(demoScene);

    document = addWall(document, [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
    ]);
    document = addEntrance(document, "source", { x: 8, y: 8 });
    document = addTarget(document, { x: 10, y: 12 });

    expect(document.walls.at(-1)?.id).toBe("wall-1");
    expect(document.entrances.at(-1)?.id).toBe("source-2");
    expect(document.targets.at(-1)?.id).toBe("target-3");
  });

  it("adds commercial editor objects with default parameters", () => {
    let document = createEditorDocumentFromScene(demoScene);

    document = addShop(document, { x: 12, y: 12 });
    document = addServicePoint(document, "counter", { x: 20, y: 12 });
    document = addServicePoint(document, "gate", { x: 28, y: 12 });
    document = addCountLine(document, { x: 34, y: 12 });

    expect(document.shops.at(-1)).toMatchObject({
      id: "shop-1",
      attraction: 1,
      capacity: 12,
    });
    expect(document.servicePoints.map((point) => point.id)).toEqual([
      "counter-2",
      "gate-3",
    ]);
    expect(document.countLines.at(-1)?.points).toEqual([
      { x: 34, y: 12 },
      { x: 42, y: 12 },
    ]);
  });

  it("loads BioCity editor objects from schema scenes", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);

    expect(document.roads.map((road) => road.id)).toContain("rain-market-avenue");
    expect(document.buildings.map((building) => building.id)).toContain("glass-arcade");
    expect(document.transitStops[0]).toMatchObject({
      id: "rain-market-bus-stop",
      roadId: "bus-loop",
      kind: "bus",
    });
    expect(document.obstacles[0]).toMatchObject({
      id: "umbrella-queue-rails",
      geometryType: "polyline",
    });
    expect(document.hazards[0]).toMatchObject({
      id: "curbside-pooling",
      affectedRoadId: "rain-market-avenue",
    });
  });

  it("adds BioCity editor objects with stable defaults", () => {
    let document = createEditorDocumentFromScene(demoScene);

    document = addRoad(document, { x: 20, y: 20 });
    document = addBuilding(document, { x: 38, y: 20 });
    document = addTransitStop(document, { x: 24, y: 22 });
    document = addObstacle(document, { x: 48, y: 22 });
    document = addHazard(document, { x: 56, y: 22 });

    expect(document.roads.at(-1)).toMatchObject({
      id: "road-1",
      direction: "twoWay",
      widthMeters: 6,
    });
    expect(document.buildings.at(-1)).toMatchObject({
      id: "building-2",
      kind: "mixedUse",
      floors: 5,
    });
    expect(document.transitStops.at(-1)).toMatchObject({
      id: "transit-stop-3",
      roadId: "road-1",
      kind: "bus",
    });
    expect(document.obstacles.at(-1)).toMatchObject({
      id: "obstacle-4",
      kind: "constructionBarrier",
      blocksMovement: true,
    });
    expect(document.hazards.at(-1)).toMatchObject({
      id: "hazard-5",
      affectedRoadId: "road-1",
      kind: "roadClosure",
    });
  });

  it("adds, updates, moves, and exports commercial zones", () => {
    let document = addZone(createEditorDocumentFromScene(demoScene), {
      x: 30,
      y: 20,
    });
    const zoneId = document.zones[0].id;

    document = updateDocumentZoneCategory(document, zoneId, "jewelry");
    document = updateDocumentZoneNumber(document, zoneId, "attraction", 0.82);
    document = toggleDocumentZoneWalkable(document, zoneId);
    document = moveEntity(document, zoneId, { x: 2, y: 4 });

    const scene = createSceneFromEditorDocument(demoScene, document);

    expect(document.zones[0]).toMatchObject({
      attraction: 0.82,
      category: "jewelry",
      walkable: false,
    });
    expect(scene.zones[0]).toMatchObject({
      category: "jewelry",
      id: "zone-1",
      walkable: false,
    });
    expect(scene.zones[0].geometry.points[0]).toEqual({ x: 23, y: 19 });
  });

  it("moves and removes entities", () => {
    let document = addTarget(createEditorDocumentFromScene(demoScene), {
      x: 10,
      y: 10,
    });
    const targetId = document.targets.at(-1)!.id;

    document = moveEntity(document, targetId, { x: 2, y: -4 });
    expect(document.targets.at(-1)?.position).toEqual({ x: 12, y: 6 });

    document = removeEntity(document, targetId);
    expect(document.targets.some((target) => target.id === targetId)).toBe(false);
  });

  it("moves and removes BioCity entities", () => {
    let document = addRoad(createEditorDocumentFromScene(demoScene), {
      x: 20,
      y: 20,
    });
    const roadId = document.roads.at(-1)!.id;

    document = moveEntity(document, roadId, { x: 2, y: -4 });
    expect(document.roads.at(-1)?.points[0]).toEqual({ x: 12, y: 16 });

    document = removeEntity(document, roadId);
    expect(document.roads.some((road) => road.id === roadId)).toBe(false);
  });

  it("exports editor documents back to valid scene json", () => {
    const document = addWall(createEditorDocumentFromScene(demoScene), [
      { x: 2, y: 2 },
      { x: 8, y: 8 },
    ]);
    const scene = createSceneFromEditorDocument(demoScene, document);

    expect(scene.schemaVersion).toBe("1.0.0");
    expect(scene.walls.at(-1)?.id).toBe("wall-1");
    expect(
      scene.entrances.find((entrance) => entrance.kind === "source"),
    ).toBeDefined();
  });

  it("exports commercial objects back to valid scene json", () => {
    let document = createEditorDocumentFromScene(demoScene);

    document = addShop(document, { x: 12, y: 12 });
    document = addServicePoint(document, "gate", { x: 20, y: 12 });
    document = addCountLine(document, { x: 30, y: 12 });

    const scene = createSceneFromEditorDocument(demoScene, document);

    expect(scene.shops.some((shop) => shop.id === "shop-1")).toBe(true);
    expect(scene.shops.some((shop) => shop.brand?.profileId === "coffee-pulse")).toBe(
      true,
    );
    expect(scene.servicePoints[0].kind).toBe("gate");
    expect(scene.countLines[0].geometry.points).toHaveLength(2);
  });

  it("exports BioCity editor objects back to valid scene json", () => {
    let document = createEditorDocumentFromScene(demoScene);

    document = addRoad(document, { x: 20, y: 20 });
    document = addBuilding(document, { x: 38, y: 20 });
    document = addTransitStop(document, { x: 24, y: 22 });
    document = addObstacle(document, { x: 48, y: 22 });
    document = addHazard(document, { x: 56, y: 22 });

    const scene = createSceneFromEditorDocument(demoScene, document);

    expect(scene.roads[0]).toMatchObject({
      id: "road-1",
      direction: "twoWay",
    });
    expect(scene.buildings[0]).toMatchObject({
      id: "building-2",
      kind: "mixedUse",
      visitorCapacity: 120,
    });
    expect(scene.transitStops[0]).toMatchObject({
      id: "transit-stop-3",
      roadId: "road-1",
    });
    expect(scene.obstacles[0].geometry.points).toHaveLength(2);
    expect(scene.hazards[0]).toMatchObject({
      id: "hazard-5",
      affectedRoadId: "road-1",
      routeCostMultiplier: 2,
    });
  });

  it("ships three importable example scenes", () => {
    expect(exampleScenes.map((scene) => scene.id)).toEqual([
      "metro-station-hall",
      "mall-atrium",
      "performance-venue",
    ]);
    expect(exampleScenes.every((scene) => scene.entrances.length > 0)).toBe(true);
  });
});
