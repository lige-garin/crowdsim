import { describe, expect, it } from "vitest";
import { parseScene, type ScenePoint } from "@crowdsim/scene-schema";
import { createRouter } from "../engine/crowdNavigation";
import { industryTemplates } from "./industryTemplates";
import { wallSegmentsFromScene } from "../engine/sceneGeometry";

/**
 * The buildings and shops added to every industry template (2026-09-24) are
 * real obstacles -- `wallSegmentsFromScene` turns a building footprint into
 * wall segments, doorways cut only at that building's own `entrancePosition`
 * (`sceneGeometry.ts`). A footprint placed carelessly can silently wall off
 * an entrance, a target, or a service point with nothing failing except the
 * agents' ability to get there. This is the decisive check for that: every
 * source entrance must be able to route to every sink, target, service
 * point, and shop door on the same scene -- not merely present in the JSON.
 */
describe("industry template reachability", () => {
  for (const template of industryTemplates) {
    const scene = template.scene;
    // Built once and reused by the one assertion below -- this used to be
    // built twice (once per `it`), including a second `it` that never
    // exercised it because none of these templates' buildings declare an
    // entrancePosition (see "building doorway cutting" below for that case,
    // proven decisively on synthetic data instead of vacuously on this).
    const walls = wallSegmentsFromScene(scene);
    const router = createRouter(scene.world, walls);

    it(`${template.id}: every sink/target/service point is reachable from every source`, () => {
      const sources = scene.entrances.filter((entrance) => entrance.kind === "source");
      const destinations: { id: string; position: ScenePoint }[] = [
        ...scene.entrances
          .filter((entrance) => entrance.kind === "sink")
          .map((entrance) => ({ id: entrance.id, position: entrance.position })),
        ...scene.targets.map((target) => ({
          id: target.id,
          position: target.position,
        })),
        ...scene.servicePoints.map((point) => ({
          id: point.id,
          position: point.position,
        })),
        ...scene.shops
          .filter((shop) => shop.entrancePosition)
          .map((shop) => ({ id: shop.id, position: shop.entrancePosition! })),
      ];

      expect(sources.length).toBeGreaterThan(0);
      expect(destinations.length).toBeGreaterThan(0);

      for (const source of sources) {
        for (const destination of destinations) {
          const distance = router.distance(source.position, destination.position);
          expect(
            Number.isFinite(distance),
            `${template.id}: ${source.id} -> ${destination.id} is unreachable`,
          ).toBe(true);
        }
      }
    });
  }
});

/**
 * None of the six templates' buildings declare an `entrancePosition` (all
 * are sealed decorative shells placed off the walking corridor, by design --
 * see each template's own comment in exampleScenes.ts/industryTemplates.ts).
 * A per-template "is this building's door open" check would therefore never
 * run its assertion on real data. This is the decisive version instead:
 * synthetic data built specifically to exercise `wallSegmentsFromScene`'s
 * doorway-cutting (`sceneGeometry.ts`'s `cutDoorways`), on both sides --
 * proof it opens a door when told to, and proof a footprint with no declared
 * entrance is genuinely sealed (not accidentally reachable some other way).
 */
describe("building doorway cutting", () => {
  const building = (id: string, entrancePosition?: ScenePoint) => ({
    schemaVersion: "1.0.0" as const,
    id: "doorway-fixture",
    name: "Doorway Fixture",
    world: { width: 40, height: 40 },
    entrances: [
      { id: "source", kind: "source" as const, position: { x: 2, y: 20 }, width: 4 },
    ],
    buildings: [
      {
        id,
        kind: "civic" as const,
        footprint: {
          type: "polygon" as const,
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
            { x: 10, y: 30 },
          ],
        },
        entrancePosition,
      },
    ],
  });

  it("is reachable inside a building whose entrancePosition opens a real doorway", () => {
    // entrancePosition sits in the doorway gap (on the west edge); the
    // assertion targets a point genuinely inside the footprint (x=15, well
    // past the edge) to prove the door actually lets you *through*, not
    // just that the doorway coordinate itself is reachable.
    const scene = parseScene(building("open", { x: 10, y: 20 }));
    const router = createRouter(scene.world, wallSegmentsFromScene(scene));
    const distance = router.distance({ x: 2, y: 20 }, { x: 15, y: 20 });

    expect(Number.isFinite(distance)).toBe(true);
  });

  it("is unreachable inside a building with no entrancePosition at all", () => {
    const scene = parseScene(building("sealed"));
    const router = createRouter(scene.world, wallSegmentsFromScene(scene));
    const distance = router.distance({ x: 2, y: 20 }, { x: 20, y: 20 });

    expect(Number.isFinite(distance)).toBe(false);
  });
});
