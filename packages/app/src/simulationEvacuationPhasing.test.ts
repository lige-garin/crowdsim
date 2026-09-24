import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { createSimulationEngineFromScene } from "./simulationEngine";

/**
 * A two-floor mall: a shop and a fire on "fire-floor", the same layout with
 * no fire on "safe-floor" (ADR-0025). Both floors keep the same geometry so
 * any behavioural difference between them is attributable to the hazard, not
 * to the layout.
 */
function twoFloorScene(overrides: { withHazard: boolean }): CrowdSimScene {
  const floor = (id: string, level: number) => ({
    entrances: [
      {
        id: `${id}-door`,
        floorId: id,
        kind: "source" as const,
        position: { x: 5, y: 30 },
        width: 6,
        arrivalRatePerMinute: 600,
        groupShare: 0,
      },
      {
        id: `${id}-exit`,
        floorId: id,
        kind: "sink" as const,
        position: { x: 5, y: 5 },
        width: 6,
      },
    ],
    shops: [
      {
        id: `${id}-shop`,
        floorId: id,
        position: { x: 40, y: 40 },
        size: { width: 8, height: 8 },
        attraction: 1,
        capacity: 50,
        dwellMeanSeconds: 600,
      },
    ],
    id,
    level,
  });

  const ground = floor("fire-floor", 0);
  const upper = floor("safe-floor", 1);

  return parseScene({
    ...demoScene,
    id: "two-floor-evacuation-demo",
    shops: [...ground.shops, ...upper.shops],
    servicePoints: [],
    world: { width: 80, height: 40 },
    walls: [],
    floors: [
      { id: "fire-floor", level: 0, elevationMeters: 0 },
      { id: "safe-floor", level: 1, elevationMeters: 4.5 },
    ],
    entrances: [...ground.entrances, ...upper.entrances],
    hazards: overrides.withHazard
      ? [
          {
            id: "fire-1",
            floorId: "fire-floor",
            kind: "fire" as const,
            position: { x: 40, y: 20 },
            radiusMeters: 20,
            growthSeconds: 1,
            startsAtSeconds: 0,
            severity: 0.5,
            speedMultiplier: 0.9,
            visibilityMultiplier: 0.6,
            riskScore: 0.5,
          },
        ]
      : [],
  });
}

describe("phased evacuation through the live engine (ADR-0025)", () => {
  it("evacuates only the floor a real fire is on, leaving the other floor shopping", () => {
    const engine = createSimulationEngineFromScene(
      twoFloorScene({ withHazard: true }),
      {
        maxAgents: 80,
      },
    );
    engine.start();
    // Let people spawn and settle into browsing before raising the alarm.
    engine.step(600);
    engine.setEvacuation(true);
    // A minute past the alarm at 1x — long enough for every premovement
    // time to have run out.
    const snapshot = engine.step(3600);

    const fireFloor = snapshot.agents.filter((agent) => agent.floorId === "fire-floor");
    const safeFloor = snapshot.agents.filter((agent) => agent.floorId === "safe-floor");

    expect(fireFloor.length + safeFloor.length).toBeGreaterThan(0);
    expect(
      fireFloor.some(
        (agent) => agent.lifecycleState === "evacuate" || agent.incapacitated,
      ),
    ).toBe(true);
    // Nobody on the untouched floor was ever told to evacuate.
    expect(safeFloor.every((agent) => agent.lifecycleState !== "evacuate")).toBe(true);
  });

  it("evacuates every floor when no hazard is declared (regression: unchanged from before phasing existed)", () => {
    const engine = createSimulationEngineFromScene(
      twoFloorScene({ withHazard: false }),
      { maxAgents: 80 },
    );
    engine.start();
    engine.step(600);
    engine.setEvacuation(true);
    const snapshot = engine.step(3600);

    const fireFloor = snapshot.agents.filter((agent) => agent.floorId === "fire-floor");
    const safeFloor = snapshot.agents.filter((agent) => agent.floorId === "safe-floor");

    expect(fireFloor.length + safeFloor.length).toBeGreaterThan(0);
    expect(fireFloor.some((agent) => agent.lifecycleState === "evacuate")).toBe(true);
    expect(safeFloor.some((agent) => agent.lifecycleState === "evacuate")).toBe(true);
  });
});
