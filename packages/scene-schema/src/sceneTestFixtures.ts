export const validScene = {
  schemaVersion: "1.0.0",
  id: "atrium-demo",
  name: "Atrium Demo",
  world: {
    width: 80,
    height: 48,
  },
  walls: [
    {
      id: "north-wall",
      geometry: {
        type: "polyline",
        points: [
          { x: 4, y: 4 },
          { x: 76, y: 4 },
        ],
      },
    },
  ],
  entrances: [
    {
      id: "main-entry",
      kind: "source",
      position: { x: 8, y: 44 },
      width: 4,
      arrivalRatePerMinute: 120,
    },
    {
      id: "east-exit",
      kind: "sink",
      position: { x: 76, y: 24 },
      width: 5,
    },
  ],
  areas: [
    {
      id: "walkable-floor",
      geometry: {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
          { x: 80, y: 48 },
          { x: 0, y: 48 },
        ],
      },
    },
  ],
  targets: [
    {
      id: "info-desk",
      position: { x: 42, y: 20 },
    },
  ],
};
