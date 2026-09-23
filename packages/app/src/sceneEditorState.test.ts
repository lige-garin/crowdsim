import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  addBuilding,
  addCountLine,
  addCountLineBetween,
  addCrosswalk,
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
  moveCountLineEndpoint,
  moveEntity,
  removeEntity,
  snapPoint,
} from "./sceneEditorState";
import {
  toggleDocumentObstacleBlocksMovement,
  toggleDocumentRoadBoolean,
  toggleDocumentTransitStopActive,
  toggleDocumentZoneWalkable,
  updateDocumentBuildingKind,
  updateDocumentBuildingNumber,
  updateDocumentCountLineName,
  updateDocumentCrosswalkNumber,
  updateDocumentCrosswalkRoadId,
  updateDocumentEntranceNumber,
  updateDocumentEntranceProfile,
  updateDocumentEntranceProfileInterval,
  updateDocumentServicePointNextId,
  updateDocumentServicePointOutageWindows,
  updateDocumentHazardKind,
  updateDocumentHazardNumber,
  updateDocumentObstacleKind,
  updateDocumentObstacleNumber,
  updateDocumentRoadDirection,
  updateDocumentRoadNumber,
  updateDocumentTransitStopKind,
  updateDocumentTransitStopNumber,
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

  it("carries a count line's name into the scene and back", () => {
    let document = addCountLineBetween(
      createEditorDocumentFromScene(demoScene),
      {
        x: 4,
        y: 6,
      },
      { x: 4, y: 20 },
    );
    const lineId = document.countLines.at(-1)!.id;

    document = updateDocumentCountLineName(document, lineId, "West gate");
    const exported = createSceneFromEditorDocument(demoScene, document);
    expect(exported.countLines.at(-1)?.name).toBe("West gate");
    expect(parseScene(exported).countLines.at(-1)?.name).toBe("West gate");
    expect(createEditorDocumentFromScene(exported).countLines.at(-1)?.name).toBe(
      "West gate",
    );

    // Clearing it drops the field rather than storing an empty name, which the
    // schema would reject.
    document = updateDocumentCountLineName(document, lineId, "   ");
    expect(
      createSceneFromEditorDocument(demoScene, document).countLines.at(-1)?.name,
    ).toBeUndefined();
  });

  it("moves one end of a count line and leaves the other where it was", () => {
    let document = addCountLineBetween(
      createEditorDocumentFromScene(demoScene),
      {
        x: 10,
        y: 10,
      },
      { x: 10, y: 30 },
    );
    const lineId = document.countLines.at(-1)!.id;

    document = moveCountLineEndpoint(document, lineId, 0, { x: 20, y: 10 });
    expect(document.countLines.at(-1)?.points).toEqual([
      { x: 20, y: 10 },
      { x: 10, y: 30 },
    ]);

    document = moveCountLineEndpoint(document, lineId, 1, { x: 20, y: 30 });
    expect(document.countLines.at(-1)?.points).toEqual([
      { x: 20, y: 10 },
      { x: 20, y: 30 },
    ]);
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

  it("round-trips every entrance kind and its calibrated arrival rate", () => {
    const scene = parseScene({
      ...demoScene,
      entrances: [
        {
          id: "north-gate",
          kind: "bidirectional",
          position: { x: 4, y: 9 },
          width: 6,
          arrivalRatePerMinute: 45,
        },
        {
          id: "west-door",
          kind: "source",
          position: { x: 2, y: 5 },
          width: 4,
          arrivalRatePerMinute: 37,
        },
        {
          id: "fire-exit",
          kind: "sink",
          position: { x: 30, y: 5 },
          width: 5,
          arrivalRatePerMinute: 0,
        },
      ],
    });

    const document = createEditorDocumentFromScene(scene);
    const roundTripped = createSceneFromEditorDocument(scene, document);

    expect(document.entrances).toHaveLength(3);
    expect(roundTripped.entrances).toEqual(scene.entrances);
  });

  it("gives a newly drawn entrance a demand matching its kind", () => {
    const document = addEntrance(
      addEntrance(createEditorDocumentFromScene(demoScene), "source", { x: 8, y: 8 }),
      "sink",
      { x: 12, y: 8 },
    );

    expect(document.entrances.at(-2)).toMatchObject({ arrivalRatePerMinute: 120 });
    expect(document.entrances.at(-1)).toMatchObject({ arrivalRatePerMinute: 0 });
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

  it("updates BioCity object properties and exports them", () => {
    let document = createEditorDocumentFromScene(demoScene);

    document = addRoad(document, { x: 20, y: 20 });
    document = addBuilding(document, { x: 38, y: 20 });
    document = addTransitStop(document, { x: 24, y: 22 });
    document = addObstacle(document, { x: 48, y: 22 });
    document = addHazard(document, { x: 56, y: 22 });

    document = updateDocumentRoadDirection(document, "road-1", "oneWayForward");
    document = updateDocumentRoadNumber(document, "road-1", "widthMeters", 12);
    document = toggleDocumentRoadBoolean(document, "road-1", "transitOnly");
    document = updateDocumentBuildingKind(document, "building-2", "retail");
    document = updateDocumentBuildingNumber(document, "building-2", "floors", 9);
    document = updateDocumentTransitStopKind(document, "transit-stop-3", "tram");
    document = updateDocumentTransitStopNumber(
      document,
      "transit-stop-3",
      "delayFactor",
      1.35,
    );
    document = toggleDocumentTransitStopActive(document, "transit-stop-3");
    document = updateDocumentObstacleKind(document, "obstacle-4", "water");
    document = updateDocumentObstacleNumber(
      document,
      "obstacle-4",
      "routeCostMultiplier",
      6,
    );
    document = toggleDocumentObstacleBlocksMovement(document, "obstacle-4");
    document = updateDocumentHazardKind(document, "hazard-5", "flood");
    document = updateDocumentHazardNumber(document, "hazard-5", "severity", 0.82);
    document = updateDocumentHazardNumber(
      document,
      "hazard-5",
      "routeCostMultiplier",
      3.4,
    );

    const scene = createSceneFromEditorDocument(demoScene, document);

    expect(scene.roads[0]).toMatchObject({
      direction: "oneWayForward",
      transitOnly: true,
      widthMeters: 12,
    });
    expect(scene.buildings[0]).toMatchObject({ floors: 9, kind: "retail" });
    expect(scene.transitStops[0]).toMatchObject({
      active: false,
      delayFactor: 1.35,
      kind: "tram",
    });
    expect(scene.obstacles[0]).toMatchObject({
      blocksMovement: false,
      kind: "water",
      routeCostMultiplier: 6,
    });
    expect(scene.hazards[0]).toMatchObject({
      kind: "flood",
      routeCostMultiplier: 3.4,
      severity: 0.82,
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

describe("editor round-trip of ADR-0008 fields", () => {
  it("keeps an entrance's allowed exits and a counter's servers and name", () => {
    const scene = {
      ...demoScene,
      entrances: demoScene.entrances.map((entrance, index) =>
        index === 0 ? { ...entrance, exitIds: ["somewhere"] } : entrance,
      ),
      servicePoints: [
        {
          capacityPerMinute: 60,
          id: "till",
          kind: "counter" as const,
          name: "Main tills",
          outageWindows: [],
          position: { x: 4, y: 4 },
          serviceMeanSeconds: 30,
          servers: 4,
          width: 3,
        },
      ],
    };

    const back = createSceneFromEditorDocument(
      scene,
      createEditorDocumentFromScene(scene),
    );

    expect(back.entrances[0].exitIds).toEqual(["somewhere"]);
    expect(back.servicePoints[0]).toMatchObject({ name: "Main tills", servers: 4 });
  });

  it("keeps a service point's checkpoint chain and outage windows through apply (ADR-0017)", () => {
    const scene = {
      ...demoScene,
      servicePoints: [
        {
          capacityPerMinute: 60,
          id: "security",
          kind: "gate" as const,
          nextServicePointId: "ticket-gate",
          outageWindows: [{ endsAtSeconds: 900, startsAtSeconds: 600 }],
          position: { x: 4, y: 4 },
          serviceMeanSeconds: 8,
          width: 3,
        },
        {
          capacityPerMinute: 120,
          id: "ticket-gate",
          kind: "gate" as const,
          outageWindows: [],
          position: { x: 8, y: 4 },
          serviceMeanSeconds: 4,
          width: 3,
        },
      ],
    };

    const back = createSceneFromEditorDocument(
      scene,
      createEditorDocumentFromScene(scene),
    );

    expect(back.servicePoints[0].nextServicePointId).toBe("ticket-gate");
    expect(back.servicePoints[0].outageWindows).toEqual([
      { endsAtSeconds: 900, startsAtSeconds: 600 },
    ]);
  });

  it("keeps a road's vehicle fields through apply, even with no editor control for them yet (ADR-0016) -- found on review, not by a later bug report", () => {
    const scene = parseScene({
      ...demoScene,
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          vehicleAccessible: true,
          vehicleArrivalRatePerMinute: 12,
          vehicleSpeedLimitMetersPerSecond: 11.1,
        },
      ],
    });

    const back = createSceneFromEditorDocument(
      scene,
      createEditorDocumentFromScene(scene),
    );

    expect(back.roads[0]).toMatchObject({
      vehicleAccessible: true,
      vehicleArrivalRatePerMinute: 12,
      vehicleSpeedLimitMetersPerSecond: 11.1,
    });
  });

  it("places a crosswalk on the nearest road, not just the last one drawn (ADR-0020)", () => {
    let document = createEditorDocumentFromScene(demoScene);
    document = addRoad(document, { x: 0, y: 0 }); // -10..10 on y=0
    document = addRoad(document, { x: 0, y: 40 }); // -10..10 on y=40, drawn last
    const nearFirstRoad = { x: 0, y: 1 };

    document = addCrosswalk(document, nearFirstRoad);
    const crosswalk = document.crosswalks.at(-1)!;

    expect(crosswalk.roadId).toBe(document.roads.at(-2)!.id);
    expect(crosswalk.roadId).not.toBe(document.roads.at(-1)!.id);
    expect(crosswalk.widthMeters).toBe(3);
  });

  it("does not place a crosswalk with no road to attach it to, the same guard addConnector uses for a scene with too few floors", () => {
    const document = createEditorDocumentFromScene(
      parseScene({ ...demoScene, roads: [] }),
    );

    expect(addCrosswalk(document, { x: 5, y: 5 }).crosswalks).toHaveLength(0);
  });

  it("edits a crosswalk's road and width, and keeps both through apply", () => {
    let document = createEditorDocumentFromScene(demoScene);
    document = addRoad(document, { x: 20, y: 20 });
    document = addCrosswalk(document, { x: 20, y: 20 });
    const crosswalk = document.crosswalks[0];
    const otherRoad = document.roads[0];

    document = updateDocumentCrosswalkRoadId(document, crosswalk.id, otherRoad.id);
    document = updateDocumentCrosswalkNumber(document, crosswalk.id, "widthMeters", 5);

    expect(document.crosswalks[0].roadId).toBe(otherRoad.id);
    expect(document.crosswalks[0].widthMeters).toBe(5);

    const back = createSceneFromEditorDocument(demoScene, document);
    expect(back.crosswalks[0]).toMatchObject({
      roadId: otherRoad.id,
      widthMeters: 5,
    });
  });

  it("moves and deletes a crosswalk the same way every other point entity does", () => {
    let document = createEditorDocumentFromScene(demoScene);
    document = addRoad(document, { x: 0, y: 0 });
    document = addCrosswalk(document, { x: 0, y: 1 });
    const crosswalk = document.crosswalks[0];

    document = moveEntity(document, crosswalk.id, { x: 3, y: 4 });
    expect(document.crosswalks[0].position).toEqual({ x: 3, y: 5 });

    document = removeEntity(document, crosswalk.id);
    expect(document.crosswalks).toHaveLength(0);
  });

  it("edits an entrance's demand profile and group share and keeps them through apply", () => {
    let document = createEditorDocumentFromScene(demoScene);
    const gate = document.entrances.find((entrance) => entrance.kind !== "sink")!;
    document = updateDocumentEntranceProfile(document, gate.id, "60, 120，x 0  90");
    document = updateDocumentEntranceNumber(document, gate.id, "groupShare", 1.4);

    const scene = createSceneFromEditorDocument(demoScene, document);
    const entrance = scene.entrances.find((candidate) => candidate.id === gate.id)!;
    expect(entrance.arrivalProfile).toEqual({
      intervalMinutes: 15,
      ratesPerMinute: [60, 120, 0, 90],
    });
    expect(entrance.groupShare).toBe(1);
    expect(createEditorDocumentFromScene(scene).entrances).toContainEqual(
      expect.objectContaining({
        arrivalProfile: entrance.arrivalProfile,
        groupShare: 1,
      }),
    );

    document = updateDocumentEntranceProfile(document, gate.id, "  ");
    expect(
      document.entrances.find((candidate) => candidate.id === gate.id)!.arrivalProfile,
    ).toBeUndefined();
  });

  it("edits an entrance's demand-profile slot length, and ignores the edit before a profile exists", () => {
    let document = createEditorDocumentFromScene(demoScene);
    const gate = document.entrances.find((entrance) => entrance.kind !== "sink")!;

    // No profile yet: the interval has nothing to size, so this is a no-op.
    document = updateDocumentEntranceProfileInterval(document, gate.id, 5);
    expect(
      document.entrances.find((candidate) => candidate.id === gate.id)!.arrivalProfile,
    ).toBeUndefined();

    document = updateDocumentEntranceProfile(document, gate.id, "60, 120");
    document = updateDocumentEntranceProfileInterval(document, gate.id, 5);

    const scene = createSceneFromEditorDocument(demoScene, document);
    const entrance = scene.entrances.find((candidate) => candidate.id === gate.id)!;
    expect(entrance.arrivalProfile).toEqual({
      intervalMinutes: 5,
      ratesPerMinute: [60, 120],
    });

    // Clamped, not rejected, same tolerance every other number field here gets.
    document = updateDocumentEntranceProfileInterval(document, gate.id, -3);
    expect(
      document.entrances.find((candidate) => candidate.id === gate.id)!.arrivalProfile
        ?.intervalMinutes,
    ).toBe(1);
  });

  it("chains a service point to another and can end the chain again (ADR-0021 editor control)", () => {
    const scene = parseScene({
      ...demoScene,
      servicePoints: [
        { id: "security", kind: "gate", position: { x: 4, y: 4 } },
        { id: "ticket-gate", kind: "gate", position: { x: 8, y: 4 } },
      ],
    });
    let document = createEditorDocumentFromScene(scene);
    const security = document.servicePoints.find((point) => point.id === "security")!;

    document = updateDocumentServicePointNextId(document, security.id, "ticket-gate");
    expect(
      document.servicePoints.find((point) => point.id === security.id)!
        .nextServicePointId,
    ).toBe("ticket-gate");

    document = updateDocumentServicePointNextId(document, security.id, undefined);
    expect(
      document.servicePoints.find((point) => point.id === security.id)!
        .nextServicePointId,
    ).toBeUndefined();
  });

  it("parses outage-window text into windows, dropping malformed or inverted pairs (ADR-0021 editor control)", () => {
    const scene = parseScene({
      ...demoScene,
      servicePoints: [{ id: "security", kind: "gate", position: { x: 4, y: 4 } }],
    });
    let document = createEditorDocumentFromScene(scene);
    const security = document.servicePoints[0];

    document = updateDocumentServicePointOutageWindows(
      document,
      security.id,
      "600-900, garbage, 1800-2000, 500-500",
    );

    expect(document.servicePoints[0].outageWindows).toEqual([
      { startsAtSeconds: 600, endsAtSeconds: 900 },
      { startsAtSeconds: 1800, endsAtSeconds: 2000 },
    ]);

    document = updateDocumentServicePointOutageWindows(document, security.id, "");
    expect(document.servicePoints[0].outageWindows).toEqual([]);

    const applied = createSceneFromEditorDocument(scene, document);
    expect(applied.servicePoints[0].outageWindows).toEqual([]);
  });
});
