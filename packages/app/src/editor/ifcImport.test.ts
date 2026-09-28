import { describe, expect, it } from "vitest";
import { demoScene } from "../scenes/demoScene";
import { createSceneFromIfcWithReport } from "./ifcImport";

/**
 * A minimal but real, valid IFC4 SPF file: one project/site/building/storey
 * hierarchy and one `IfcWallStandardCase`, its footprint an extruded
 * rectangle `widthMeters` long by `thicknessMeters` deep, `heightMeters`
 * tall, placed at `(originX, originY)` on its storey, optionally rotated 90°
 * (`rotated90`). Verified against the actual `web-ifc` package (not just
 * against this project's own reader) via throwaway Node scripts before
 * either this test file or `ifcImport.ts`'s coordinate math was written:
 * both a translated and a rotated placement's resolved floor-plan footprint
 * came back exactly as expected, confirming the placement-chain and
 * `flatTransformation` handling this fixture exercises.
 */
function ifcFile(
  options: {
    widthMeters?: number;
    thicknessMeters?: number;
    heightMeters?: number;
    originX?: number;
    originY?: number;
    rotated90?: boolean;
    extraEntities?: string[];
  } = {},
): string {
  const {
    widthMeters = 5,
    thicknessMeters = 0.2,
    heightMeters = 3,
    originX = 0,
    originY = 0,
    rotated90 = false,
    extraEntities = [],
  } = options;

  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION((''),'2;1');",
    "FILE_NAME('test.ifc','2026-09-23',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    "#1=IFCPROJECT('0YvctVUKr0kugbWRC2XoZ1',#2,'Project',$,$,$,$,(#20),#10);",
    "#2=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,0);",
    "#3=IFCPERSONANDORGANIZATION(#5,#6,$);",
    "#4=IFCAPPLICATION(#6,'1.0','crowdsim','crowdsim');",
    "#5=IFCPERSON($,'Author',$,$,$,$,$,$);",
    "#6=IFCORGANIZATION($,'crowdsim',$,$,$);",
    "#10=IFCUNITASSIGNMENT((#11,#12));",
    "#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
    "#12=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);",
    "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#21,$);",
    "#21=IFCAXIS2PLACEMENT3D(#22,$,$);",
    "#22=IFCCARTESIANPOINT((0.,0.,0.));",
    "#30=IFCSITE('0YvctVUKr0kugbWRC2XoZ2',#2,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$);",
    "#31=IFCLOCALPLACEMENT($,#21);",
    "#40=IFCBUILDING('0YvctVUKr0kugbWRC2XoZ3',#2,'Building',$,$,#41,$,$,.ELEMENT.,$,$,$);",
    "#41=IFCLOCALPLACEMENT(#31,#21);",
    "#50=IFCBUILDINGSTOREY('0YvctVUKr0kugbWRC2XoZ4',#2,'Storey',$,$,#51,$,$,.ELEMENT.,0.);",
    "#51=IFCLOCALPLACEMENT(#41,#21);",
    "#60=IFCRELAGGREGATES('0YvctVUKr0kugbWRC2XoZ5',#2,$,$,#1,(#30));",
    "#61=IFCRELAGGREGATES('0YvctVUKr0kugbWRC2XoZ6',#2,$,$,#30,(#40));",
    "#62=IFCRELAGGREGATES('0YvctVUKr0kugbWRC2XoZ7',#2,$,$,#40,(#50));",
    "#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('0YvctVUKr0kugbWRC2XoZ8',#2,$,$,(#100),#50);",
    "#80=IFCCARTESIANPOINT((0.,0.));",
    `#81=IFCCARTESIANPOINT((${widthMeters}.,0.));`,
    `#82=IFCCARTESIANPOINT((${widthMeters}.,${thicknessMeters}));`,
    `#83=IFCCARTESIANPOINT((0.,${thicknessMeters}));`,
    "#84=IFCCARTESIANPOINT((0.,0.));",
    "#85=IFCPOLYLINE((#80,#81,#82,#83,#84));",
    "#86=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#85);",
    "#87=IFCAXIS2PLACEMENT3D(#22,$,$);",
    "#88=IFCDIRECTION((0.,0.,1.));",
    `#89=IFCEXTRUDEDAREASOLID(#86,#87,#88,${heightMeters}.);`,
    "#90=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#89));",
    "#91=IFCPRODUCTDEFINITIONSHAPE($,$,(#90));",
    `#93=IFCCARTESIANPOINT((${originX}.,${originY}.,0.));`,
    ...(rotated90 ? ["#95=IFCDIRECTION((0.,1.,0.));"] : []),
    `#94=IFCAXIS2PLACEMENT3D(#93,$,${rotated90 ? "#95" : "$"});`,
    "#92=IFCLOCALPLACEMENT(#51,#94);",
    "#100=IFCWALLSTANDARDCASE('0YvctVUKr0kugbWRC2XoZ9',#2,'Wall-1',$,$,#92,#91,$);",
    ...extraEntities,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("createSceneFromIfcWithReport", () => {
  it("reads a wall's real footprint from its resolved 3D geometry", async () => {
    const { scene, wallCount, hadUnconvertedEntities } =
      await createSceneFromIfcWithReport(demoScene, encode(ifcFile()));

    expect(wallCount).toBe(1);
    expect(hadUnconvertedEntities).toBe(false);
    const wall = scene.walls.find((w) => w.id === "ifc-wall-100")!;
    expect(wall).toBeDefined();
    expect(wall.geometry.type).toBe("polygon");
    const xs = wall.geometry.points.map((p) => p.x);
    const ys = wall.geometry.points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 3);
    expect(Math.max(...xs)).toBeCloseTo(5, 3);
    expect(Math.min(...ys)).toBeCloseTo(0, 3);
    expect(Math.max(...ys)).toBeCloseTo(0.2, 3);
  });

  it("applies the wall's own placement offset to its footprint", async () => {
    const { scene } = await createSceneFromIfcWithReport(
      demoScene,
      encode(ifcFile({ originX: 10, originY: 20 })),
    );

    const wall = scene.walls.find((w) => w.id === "ifc-wall-100")!;
    const xs = wall.geometry.points.map((p) => p.x);
    const ys = wall.geometry.points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(10, 3);
    expect(Math.max(...xs)).toBeCloseTo(15, 3);
    expect(Math.min(...ys)).toBeCloseTo(20, 3);
    expect(Math.max(...ys)).toBeCloseTo(20.2, 3);
  });

  it("applies the wall's own placement rotation to its footprint, not just translation", async () => {
    const { scene } = await createSceneFromIfcWithReport(
      demoScene,
      encode(ifcFile({ rotated90: true })),
    );

    // Rotated 90°, the 5 m x 0.2 m rectangle's long axis swaps from x to y.
    const wall = scene.walls.find((w) => w.id === "ifc-wall-100")!;
    const xs = wall.geometry.points.map((p) => p.x);
    const ys = wall.geometry.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5, 3);
  });

  it("reports unconverted entities (a door) without importing them", async () => {
    const { wallCount, hadUnconvertedEntities } = await createSceneFromIfcWithReport(
      demoScene,
      encode(
        ifcFile({
          extraEntities: [
            "#200=IFCDOOR('0YvctVUKr0kugbWRC2XoZA',#2,'Door-1',$,$,$,$,$,2.1,0.9,$,$,$);",
          ],
        }),
      ),
    );

    expect(wallCount).toBe(1); // the door is not a wall
    expect(hadUnconvertedEntities).toBe(true);
  });

  it("expands the world to contain an imported wall that sits outside it", async () => {
    const smallWorldScene = { ...demoScene, world: { height: 2, width: 2 } };
    const { scene } = await createSceneFromIfcWithReport(
      smallWorldScene,
      encode(ifcFile({ widthMeters: 40 })),
    );

    expect(scene.world.width).toBeGreaterThan(40);
  });

  it("carries the wall thickness option through, even though the footprint is already exact", async () => {
    const { scene } = await createSceneFromIfcWithReport(demoScene, encode(ifcFile()), {
      thickness: 0.35,
    });

    expect(scene.walls.find((w) => w.id === "ifc-wall-100")?.thickness).toBe(0.35);
  });

  it("merges with, rather than replaces, walls already in the scene", async () => {
    const { scene } = await createSceneFromIfcWithReport(demoScene, encode(ifcFile()));
    for (const wall of demoScene.walls) {
      expect(scene.walls.some((w) => w.id === wall.id)).toBe(true);
    }
  });
});
