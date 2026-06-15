import { parseScene } from "@crowdsim/scene-schema";

export const exampleScenes = [
  parseScene({
    schemaVersion: "1.0.0",
    id: "metro-station-hall",
    name: "Metro Station Hall",
    seed: 101,
    world: { width: 96, height: 56 },
    walls: [
      {
        id: "platform-rail",
        geometry: {
          type: "polyline",
          points: [
            { x: 8, y: 16 },
            { x: 88, y: 16 },
          ],
        },
      },
      {
        id: "ticket-barrier",
        geometry: {
          type: "polyline",
          points: [
            { x: 32, y: 32 },
            { x: 64, y: 32 },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "street-entry",
        kind: "source",
        position: { x: 12, y: 48 },
        width: 6,
        arrivalRatePerMinute: 180,
      },
      {
        id: "platform-exit",
        kind: "sink",
        position: { x: 88, y: 8 },
        width: 8,
      },
    ],
    areas: [
      {
        id: "station-floor",
        geometry: {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 96, y: 0 },
            { x: 96, y: 56 },
            { x: 0, y: 56 },
          ],
        },
      },
    ],
    targets: [{ id: "gate-line", position: { x: 48, y: 28 }, radius: 2 }],
  }),
  parseScene({
    schemaVersion: "1.0.0",
    id: "mall-atrium",
    name: "Mall Atrium",
    seed: 202,
    world: { width: 88, height: 64 },
    walls: [
      {
        id: "north-shopfront",
        geometry: {
          type: "polyline",
          points: [
            { x: 10, y: 12 },
            { x: 34, y: 12 },
            { x: 34, y: 22 },
          ],
        },
      },
      {
        id: "south-shopfront",
        geometry: {
          type: "polyline",
          points: [
            { x: 52, y: 48 },
            { x: 78, y: 48 },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "west-door",
        kind: "source",
        position: { x: 4, y: 32 },
        width: 7,
        arrivalRatePerMinute: 150,
      },
      {
        id: "east-door",
        kind: "sink",
        position: { x: 84, y: 32 },
        width: 7,
      },
    ],
    areas: [
      {
        id: "atrium-floor",
        geometry: {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 88, y: 0 },
            { x: 88, y: 64 },
            { x: 0, y: 64 },
          ],
        },
      },
    ],
    targets: [{ id: "fountain", position: { x: 44, y: 32 }, radius: 3 }],
  }),
  parseScene({
    schemaVersion: "1.0.0",
    id: "performance-venue",
    name: "Performance Venue Evacuation",
    seed: 303,
    world: { width: 100, height: 68 },
    walls: [
      {
        id: "stage-edge",
        geometry: {
          type: "polyline",
          points: [
            { x: 20, y: 14 },
            { x: 80, y: 14 },
          ],
        },
      },
      {
        id: "seating-aisle",
        geometry: {
          type: "polyline",
          points: [
            { x: 50, y: 20 },
            { x: 50, y: 58 },
          ],
        },
      },
    ],
    entrances: [
      {
        id: "audience-entry",
        kind: "source",
        position: { x: 50, y: 64 },
        width: 10,
        arrivalRatePerMinute: 240,
      },
      {
        id: "north-exit",
        kind: "sink",
        position: { x: 14, y: 8 },
        width: 8,
      },
      {
        id: "east-exit",
        kind: "sink",
        position: { x: 92, y: 34 },
        width: 8,
      },
    ],
    areas: [
      {
        id: "venue-floor",
        geometry: {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 68 },
            { x: 0, y: 68 },
          ],
        },
      },
    ],
    targets: [{ id: "stage-focus", position: { x: 50, y: 18 }, radius: 2 }],
  }),
];
