import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "../scenes/demoScene";
import {
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
} from "./sceneEditorConversions";
import { moveEntity } from "./sceneEditorMoveRemove";

const visual = { heightMeters: 5.5, signText: "Open", style: "glass" };
const custom = { alpha: 1, beta: "two" };
const persona = { browser: 0.2, commuter: 0.3, family: 0.4, shopper: 0.1 };
const opening = { opensAtMinutes: 540, closesAtMinutes: 1_200 };

const polygon = (a: [number, number], b: [number, number], c: [number, number]) => ({
  type: "polygon" as const,
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
    { x: c[0], y: c[1] },
  ],
});
const polyline = (a: [number, number], b: [number, number]) => ({
  type: "polyline" as const,
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
  ],
});

/**
 * One entity per kind, with every field the editor does *not* put in its
 * `EditorDocument` set to something other than its schema default. Those are
 * exactly the fields a hand-written mapping silently drops.
 */
const kitchenSink: CrowdSimScene = parseScene({
  ...demoScene,
  floors: [
    { id: "floor-1", level: 0, elevationMeters: 0, name: "Ground" },
    { id: "floor-2", level: 1, elevationMeters: 4.5, name: "Upper" },
  ],
  buildings: [
    {
      id: "b-1",
      kind: "retail",
      floorId: "floor-1",
      footprint: polygon([2, 2], [8, 2], [8, 6]),
      name: "Annex",
      heightMeters: 21,
      floors: 4,
      residentCapacity: 7,
      workerCapacity: 11,
      visitorCapacity: 13,
      openingHours: opening,
      customParameters: custom,
      visual,
    },
  ],
  connectors: [
    {
      id: "c-1",
      kind: "escalator",
      from: { floorId: "floor-1", point: { x: 3, y: 3 } },
      to: { floorId: "floor-2", point: { x: 4, y: 4 } },
      name: "Up",
      width: 2.2,
      bidirectional: true,
      speedMetersPerSecond: 0.75,
      capacity: 9,
      carCount: 2,
      doorSeconds: 5,
    },
  ],
  walls: [
    {
      id: "w-1",
      name: "party wall",
      geometry: polyline([1, 1], [9, 1]),
      thickness: 0.45,
    },
  ],
  zones: [
    {
      id: "z-1",
      floorId: "floor-1",
      category: "dining",
      geometry: polygon([1, 1], [9, 1], [9, 9]),
      name: "Food hall",
      walkable: false,
      attraction: 0.9,
      dwellMeanSeconds: 300,
      personaAffinity: persona,
      customParameters: custom,
      visual,
    },
  ],
  shops: [
    {
      id: "s-1",
      floorId: "floor-1",
      zoneId: "z-1",
      storeLotId: "lot-1",
      position: { x: 5, y: 5 },
      entrancePosition: { x: 5, y: 4 },
      queueAnchor: { x: 5, y: 6 },
      size: { width: 4, height: 3 },
      name: "Kiosk",
      attraction: 0.8,
      capacity: 17,
      conversionRate: 0.42,
      dwellMeanSeconds: 321,
      serviceMeanSeconds: 45,
      openingHours: opening,
      customParameters: custom,
      visual,
    },
  ],
  transitStops: [
    {
      id: "t-1",
      floorId: "floor-1",
      kind: "metro",
      position: { x: 6, y: 6 },
      name: "Metro",
      capacity: 91,
      arrivalIntervalSeconds: 240,
      alightingPerArrival: 17,
      boardingCapacityPerMinute: 42,
      delayFactor: 1.4,
      transitShare: 0.33,
      active: false,
      customParameters: custom,
      visual,
    },
  ],
  obstacles: [
    {
      id: "o-1",
      floorId: "floor-1",
      kind: "fence",
      geometry: polyline([2, 8], [6, 8]),
      name: "Fence",
      blocksMovement: false,
      routeCostMultiplier: 2.5,
      customParameters: custom,
      visual,
    },
  ],
  servicePoints: [
    {
      id: "sp-1",
      floorId: "floor-1",
      kind: "counter",
      position: { x: 7, y: 3 },
      name: "Till",
      servers: 3,
      width: 2.5,
      serviceMeanSeconds: 44,
      capacityPerMinute: 33,
      customParameters: custom,
      visual,
    },
  ],
  targets: [
    {
      id: "tg-1",
      floorId: "floor-1",
      position: { x: 7, y: 7 },
      radius: 2.5,
      name: "Rally point",
    },
  ],
  entrances: [
    {
      id: "in-1",
      floorId: "floor-1",
      kind: "source",
      position: { x: 1, y: 5 },
      width: 3,
      arrivalRatePerMinute: 120,
      groupShare: 0.2,
      name: "West door",
    },
  ],
  roads: [
    {
      id: "r-1",
      floorId: "floor-1",
      geometry: polyline([0, 12], [20, 12]),
      name: "Main",
      widthMeters: 6,
      vehicleAccessible: true,
    },
  ],
  hazards: [
    {
      id: "h-1",
      floorId: "floor-1",
      kind: "fire",
      position: { x: 12, y: 8 },
      radiusMeters: 4,
      name: "Fire",
      startsAtSeconds: 30,
      endsAtSeconds: 90,
    },
  ],
});

const groups = [
  "buildings",
  "connectors",
  "walls",
  "zones",
  "shops",
  "transitStops",
  "obstacles",
  "servicePoints",
  "targets",
  "entrances",
  "roads",
  "hazards",
] as const;

describe("editor round trip", () => {
  it("returns every entity unchanged, including fields the editor never edits", () => {
    const document = createEditorDocumentFromScene(kitchenSink);
    const out = createSceneFromEditorDocument(kitchenSink, document);

    for (const key of groups) {
      expect(out[key]).toEqual(kitchenSink[key]);
    }
  });

  it("keeps a wall thickness the editor has no field for", () => {
    const document = createEditorDocumentFromScene(kitchenSink);
    expect(
      createSceneFromEditorDocument(kitchenSink, document).walls[0]?.thickness,
    ).toBe(0.45);
  });

  it("drags a shop's door and queue along with the shop", () => {
    const moved = moveEntity(createEditorDocumentFromScene(kitchenSink), "s-1", {
      x: 3,
      y: -2,
    });

    expect(moved.shops[0]?.position).toEqual({ x: 8, y: 3 });
    expect(moved.shops[0]?.entrancePosition).toEqual({ x: 8, y: 2 });
    expect(moved.shops[0]?.queueAnchor).toEqual({ x: 8, y: 4 });
    expect(
      createSceneFromEditorDocument(kitchenSink, moved).shops[0]?.entrancePosition,
    ).toEqual({
      x: 8,
      y: 2,
    });
  });
});
