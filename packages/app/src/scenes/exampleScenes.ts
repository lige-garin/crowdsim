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
    // A solid corner block (station office) so this template's 2.5D view
    // reads as a transit hall rather than an empty floor with two rail
    // lines -- kept off the street-entry -> platform-exit walking corridor
    // and away from platform-rail (y=16). Kind "transit" biases the
    // generated city around this scene toward a denser interchange feel
    // (`cityLayout.ts`'s `characterOffsetFor`).
    buildings: [
      {
        id: "station-office",
        name: "Station Office",
        kind: "transit",
        footprint: {
          type: "polygon",
          points: [
            { x: 4, y: 2 },
            { x: 24, y: 2 },
            { x: 24, y: 13 },
            { x: 4, y: 13 },
          ],
        },
        floors: 2,
        heightMeters: 9,
        visual: { style: "transit-office" },
      },
    ],
    // Decorative only -- shops render but never block movement
    // (`sceneGeometry.ts`), so this needs no collision check.
    shops: [
      {
        id: "hall-newsstand",
        name: "Hall Newsstand",
        position: { x: 20, y: 44 },
        entrancePosition: { x: 20, y: 47 },
        size: { width: 6, height: 4 },
        attraction: 0.6,
        dwellMeanSeconds: 45,
        brand: {
          profileId: "hall-newsstand",
          category: "service",
          visibility: 0.5,
        },
      },
    ],
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
    // Two anchor-store shells, kept clear of the west-door -> fountain ->
    // east-door corridor (roughly y 28-36) and of the existing shopfront
    // walls. Kind "retail" keeps the generated ring city at its long-standing
    // default look (`characterOffsetFor`'s no-op case).
    buildings: [
      {
        id: "north-anchor-store",
        name: "North Anchor Store",
        kind: "retail",
        footprint: {
          type: "polygon",
          points: [
            { x: 10, y: 2 },
            { x: 50, y: 2 },
            { x: 50, y: 10 },
            { x: 10, y: 10 },
          ],
        },
        floors: 2,
        heightMeters: 10,
        visual: { style: "glass-retail" },
      },
      {
        id: "south-anchor-store",
        name: "South Anchor Store",
        kind: "retail",
        footprint: {
          type: "polygon",
          points: [
            { x: 38, y: 54 },
            { x: 80, y: 54 },
            { x: 80, y: 62 },
            { x: 38, y: 62 },
          ],
        },
        floors: 2,
        heightMeters: 10,
        visual: { style: "glass-retail" },
      },
    ],
    shops: [
      {
        id: "luxury-boutique",
        name: "Luxury Boutique",
        position: { x: 18, y: 17 },
        entrancePosition: { x: 18, y: 21 },
        size: { width: 8, height: 6 },
        attraction: 1.4,
        dwellMeanSeconds: 220,
        brand: {
          profileId: "luxury-boutique",
          category: "luxury",
          visibility: 0.7,
          priceTier: 5,
        },
      },
      {
        id: "cosmetics-corner",
        name: "Cosmetics Corner",
        position: { x: 28, y: 17 },
        entrancePosition: { x: 28, y: 21 },
        size: { width: 7, height: 6 },
        attraction: 1.2,
        dwellMeanSeconds: 160,
        brand: {
          profileId: "cosmetics-corner",
          category: "cosmetics",
          visibility: 0.75,
        },
      },
      {
        id: "dining-terrace",
        name: "Dining Terrace",
        position: { x: 65, y: 44 },
        entrancePosition: { x: 65, y: 40 },
        size: { width: 10, height: 6 },
        attraction: 1.3,
        dwellMeanSeconds: 480,
        brand: {
          profileId: "dining-terrace",
          category: "dining",
          visibility: 0.65,
        },
      },
      {
        id: "electronics-hub",
        name: "Electronics Hub",
        position: { x: 58, y: 44 },
        entrancePosition: { x: 58, y: 40 },
        size: { width: 8, height: 6 },
        attraction: 1.1,
        dwellMeanSeconds: 300,
        brand: {
          profileId: "electronics-hub",
          category: "electronics",
          visibility: 0.6,
        },
      },
    ],
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
    // Backstage/technical block just north of stage-edge (y=14), clear of
    // both exits and the seating-aisle divider. Kind "civic" biases the
    // surrounding generated city toward a lower, calmer skyline than a
    // downtown mall or transit hub (`characterOffsetFor`).
    buildings: [
      {
        id: "backstage-block",
        name: "Backstage",
        kind: "civic",
        footprint: {
          type: "polygon",
          points: [
            { x: 30, y: 2 },
            { x: 70, y: 2 },
            { x: 70, y: 12 },
            { x: 30, y: 12 },
          ],
        },
        floors: 1,
        heightMeters: 8,
        visual: { style: "venue-civic" },
      },
    ],
    shops: [
      {
        id: "merch-stand",
        name: "Merch Stand",
        position: { x: 75, y: 45 },
        entrancePosition: { x: 75, y: 41 },
        size: { width: 8, height: 6 },
        attraction: 0.9,
        dwellMeanSeconds: 90,
        brand: {
          profileId: "merch-stand",
          category: "entertainment",
          visibility: 0.55,
        },
      },
    ],
  }),
];
