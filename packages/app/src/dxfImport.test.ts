import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import { createSceneFromDxfWithReport } from "./dxfImport";

/** Wraps entity lines in the minimum section scaffolding a DXF needs. */
function dxf(entityLines: string[], headerLines: string[] = []): string {
  return [
    "0",
    "SECTION",
    "2",
    "HEADER",
    ...headerLines,
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entityLines,
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ].join("\n");
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer = "WALL",
): string[] {
  return [
    "0",
    "LINE",
    "8",
    layer,
    "10",
    String(x1),
    "20",
    String(y1),
    "11",
    String(x2),
    "21",
    String(y2),
  ];
}

function lwPolyline(
  vertices: [number, number][],
  options: { closed?: boolean; layer?: string } = {},
): string[] {
  const { closed = false, layer = "WALL" } = options;

  return [
    "0",
    "LWPOLYLINE",
    "8",
    layer,
    "90",
    String(vertices.length),
    "70",
    closed ? "1" : "0",
    ...vertices.flatMap(([x, y]) => ["10", String(x), "20", String(y)]),
  ];
}

function insunits(code: number): string[] {
  return ["9", "$INSUNITS", "70", String(code)];
}

describe("DXF import", () => {
  it("turns LINE entities into walls", () => {
    const result = createSceneFromDxfWithReport(demoScene, dxf([...line(0, 0, 10, 0)]));

    expect(result.wallCount).toBe(1);
    expect(result.scene.walls.at(-1)).toMatchObject({
      geometry: {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        type: "polyline",
      },
      thickness: 0.2,
    });
  });

  it("closes an LWPOLYLINE flagged as closed and keeps it open otherwise", () => {
    const rectangle: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 6],
      [0, 6],
    ];

    const closed = createSceneFromDxfWithReport(
      demoScene,
      dxf([...lwPolyline(rectangle, { closed: true })]),
    );
    const open = createSceneFromDxfWithReport(
      demoScene,
      dxf([...lwPolyline(rectangle)]),
    );

    expect(closed.scene.walls.at(-1)?.geometry.points).toHaveLength(5);
    expect(closed.scene.walls.at(-1)?.geometry.points.at(-1)).toEqual({
      x: 0,
      y: 0,
    });
    expect(closed.scene.walls.at(-1)?.geometry.type).toBe("polygon");
    expect(open.scene.walls.at(-1)?.geometry.points).toHaveLength(4);
  });

  it("scales millimetre drawings using the file's $INSUNITS", () => {
    // $INSUNITS 4 is millimetres: a 4000-unit wall is a 4 m wall.
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([...line(0, 0, 4000, 0)], insunits(4)),
    );

    expect(result.units).toBe(4);
    expect(result.scene.walls.at(-1)).toMatchObject({
      geometry: {
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
      },
    });
  });

  it("lets an explicit scale override the declared units", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([...line(0, 0, 4000, 0)], insunits(4)),
      { metersPerUnit: 1 },
    );

    expect(result.scene.walls.at(-1)).toMatchObject({
      geometry: {
        points: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
      },
    });
  });

  it("imports only the requested layers", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([...line(0, 0, 10, 0, "A-WALL"), ...line(0, 0, 10, 10, "A-ANNO-TEXT")]),
      { layers: ["A-WALL"] },
    );

    expect(result.wallCount).toBe(1);
    expect(result.scene.walls.at(-1)?.id).toBe("dxf-A-WALL-1");
  });

  it("approximates circles as closed rings", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf(["0", "CIRCLE", "8", "WALL", "10", "5", "20", "5", "40", "2"]),
    );

    const points = result.scene.walls.at(-1)?.geometry.points ?? [];

    expect(points.length).toBeGreaterThanOrEqual(24);
    // Every sample sits on the radius, so the ring really is a circle.
    for (const point of points) {
      expect(Math.hypot(point.x - 5, point.y - 5)).toBeCloseTo(2, 6);
    }
  });

  it("approximates an arc between its two angles only", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([
        "0",
        "ARC",
        "8",
        "WALL",
        "10",
        "0",
        "20",
        "0",
        "40",
        "10",
        "50",
        "0",
        "51",
        "90",
      ]),
    );

    const points = result.scene.walls.at(-1)?.geometry.points ?? [];

    expect(points.length).toBeGreaterThanOrEqual(7);
    expect(points[0]).toEqual({ x: 10, y: 0 });
    expect(points.at(-1)?.x).toBeCloseTo(0, 6);
    expect(points.at(-1)?.y).toBeCloseTo(10, 6);
  });

  it("reports entity types it cannot convert instead of dropping them silently", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([
        ...line(0, 0, 10, 0),
        "0",
        "TEXT",
        "8",
        "WALL",
        "1",
        "Room 101",
        "0",
        "HATCH",
        "8",
        "WALL",
      ]),
    );

    expect(result.wallCount).toBe(1);
    expect(result.skippedEntityTypes).toEqual(["HATCH", "TEXT"]);
  });

  it("grows the world so imported geometry is never clipped away", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([...line(0, 0, 200, 120)]),
    );

    expect(result.scene.world.width).toBeGreaterThanOrEqual(201);
    expect(result.scene.world.height).toBeGreaterThanOrEqual(121);
  });

  it("keeps existing walls and appends to them", () => {
    const before = demoScene.walls.length;
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([...line(0, 0, 10, 0), ...line(0, 0, 0, 10)]),
    );

    expect(result.scene.walls).toHaveLength(before + 2);
  });

  it("survives input that is not a DXF at all", () => {
    for (const input of ["", "not a dxf", "0\nSECTION\n2\nENTITIES\n0\nEOF"]) {
      const result = createSceneFromDxfWithReport(demoScene, input);

      expect(result.wallCount).toBe(0);
      expect(result.scene.walls).toHaveLength(demoScene.walls.length);
    }
  });

  it("ignores a vertex whose y never arrives rather than guessing one", () => {
    // Two valid vertices followed by a trailing 10 with no 20. The orphan is
    // dropped; it must not become a third vertex at (99, 99).
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf([
        "0",
        "LWPOLYLINE",
        "8",
        "WALL",
        "10",
        "1",
        "20",
        "1",
        "10",
        "2",
        "20",
        "2",
        "10",
        "99",
      ]),
    );

    expect(result.scene.walls.at(-1)?.geometry.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it("skips an entity that yields a single vertex instead of emitting an invalid wall", () => {
    const result = createSceneFromDxfWithReport(
      demoScene,
      dxf(["0", "LWPOLYLINE", "8", "WALL", "10", "5"]),
    );

    expect(result.wallCount).toBe(0);
    expect(result.skippedEntityTypes).toEqual(["LWPOLYLINE"]);
  });
});
