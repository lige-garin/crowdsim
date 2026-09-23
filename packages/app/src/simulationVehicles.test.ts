import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { createSimulationEngineFromScene } from "./simulationEngine";
import { sceneRoadRuntimes } from "./simulationSceneConfig";

/**
 * ADR-0016 stage 1 built a real, tested IDM vehicle model with nothing in
 * the live app ever calling it. ADR-0020 wires it into `simulationEngine.ts`
 * (stepped once per floor, the same "one plane, its own crowd" split the
 * engine already uses for pedestrians), the worker (rides the existing
 * snapshot `postMessage` channel `SimulationSnapshot.vehicles` adds), the
 * viewport (a small fixed-capacity `InstancedMesh`) and the editor (a
 * `vehicleAccessible` toggle plus the two number fields `EditorRoad` already
 * round-tripped from commit `61ca5b2`). These tests cover the engine wiring
 * specifically: is a road's traffic actually gated by `vehicleAccessible`,
 * does it actually move, does a multi-floor scene keep each floor's traffic
 * correctly labelled without crashing, and does a hot scene edit or a reset
 * clean vehicles up the same way it already does agents. The IDM
 * car-following/crosswalk-yielding/bus-dwell *physics* is unchanged and
 * already covered by `vehicleSimulation.test.ts` at the module level — not
 * re-proven here through the live decision backend, which cannot place a
 * pedestrian on an exact crosswalk coordinate deterministically.
 */
function vehicleLaneScene(
  overrides: Partial<CrowdSimScene["roads"][number]> = {},
): CrowdSimScene {
  return parseScene({
    ...demoScene,
    id: "vehicle-lane-demo",
    shops: [],
    servicePoints: [],
    world: { width: 320, height: 40 },
    walls: [],
    entrances: [
      {
        id: "door",
        kind: "source",
        position: { x: 10, y: 30 },
        width: 4,
        arrivalRatePerMinute: 0,
      },
      { id: "exit", kind: "sink", position: { x: 310, y: 30 }, width: 6 },
    ],
    roads: [
      {
        id: "main-street",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 10 },
            { x: 300, y: 10 },
          ],
        },
        direction: "oneWayForward",
        vehicleAccessible: true,
        vehicleArrivalRatePerMinute: 600,
        vehicleSpeedLimitMetersPerSecond: 10,
        ...overrides,
      },
    ],
  });
}

function run(scene: CrowdSimScene, steps: number, maxAgents = 60) {
  const engine = createSimulationEngineFromScene(scene, { maxAgents });
  engine.start();
  for (let step = 0; step < steps; step += 1) {
    engine.step();
  }
  return engine;
}

describe("vehicle-accessible roads (ADR-0016 stage 1, wired in by ADR-0020)", () => {
  it("drives no traffic when a road is not vehicleAccessible — the schema default, so an existing scene is unaffected", () => {
    const scene = vehicleLaneScene({ vehicleAccessible: false });

    expect(sceneRoadRuntimes(scene)).toHaveLength(0);

    const engine = run(scene, 120);
    expect(engine.snapshot().vehicles).toEqual([]);
  });

  it("spawns and drives vehicles along a vehicleAccessible road", () => {
    const engine = run(vehicleLaneScene(), 120);
    const vehicles = engine.snapshot().vehicles ?? [];

    expect(vehicles.length).toBeGreaterThan(0);
    for (const vehicle of vehicles) {
      expect(vehicle.roadId).toBe("main-street");
      expect(vehicle.x).toBeGreaterThanOrEqual(0);
      expect(vehicle.x).toBeLessThanOrEqual(300);
    }
  });

  it("moves traffic forward over time rather than leaving it parked at spawn", () => {
    const engine = run(vehicleLaneScene(), 60);
    const earlyMax = Math.max(
      0,
      ...(engine.snapshot().vehicles ?? []).map((vehicle) => vehicle.progressMeters),
    );

    engine.step(180);
    const laterMax = Math.max(
      0,
      ...(engine.snapshot().vehicles ?? []).map((vehicle) => vehicle.progressMeters),
    );

    expect(laterMax).toBeGreaterThan(earlyMax);
  });

  it("keeps two floors' traffic correctly labelled and running without cross-floor interference, even on identical road geometry", () => {
    const scene: CrowdSimScene = parseScene({
      ...demoScene,
      id: "vehicle-two-floor-demo",
      shops: [],
      servicePoints: [],
      world: { width: 320, height: 40 },
      walls: [],
      floors: [
        { id: "ground", level: 0, elevationMeters: 0 },
        { id: "upper", level: 1, elevationMeters: 4.5 },
      ],
      entrances: [
        {
          id: "ground-exit",
          floorId: "ground",
          kind: "sink",
          position: { x: 310, y: 30 },
          width: 6,
        },
        {
          id: "upper-exit",
          floorId: "upper",
          kind: "sink",
          position: { x: 310, y: 30 },
          width: 6,
        },
      ],
      roads: [
        {
          id: "ground-road",
          floorId: "ground",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 10 },
              { x: 300, y: 10 },
            ],
          },
          direction: "oneWayForward",
          vehicleAccessible: true,
          vehicleArrivalRatePerMinute: 600,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
        {
          id: "upper-road",
          floorId: "upper",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 10 },
              { x: 300, y: 10 },
            ],
          },
          direction: "oneWayForward",
          vehicleAccessible: true,
          vehicleArrivalRatePerMinute: 600,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
      ],
    });

    const engine = run(scene, 120);
    const vehicles = engine.snapshot().vehicles ?? [];
    const ground = vehicles.filter((vehicle) => vehicle.roadId === "ground-road");
    const upper = vehicles.filter((vehicle) => vehicle.roadId === "upper-road");

    expect(ground.length).toBeGreaterThan(0);
    expect(upper.length).toBeGreaterThan(0);
    expect(ground.every((vehicle) => vehicle.floorId === "ground")).toBe(true);
    expect(upper.every((vehicle) => vehicle.floorId === "upper")).toBe(true);
  });

  it("drops a vehicle's road out from under it cleanly on a hot scene edit, same as a pedestrian's deleted floor", () => {
    const engine = createSimulationEngineFromScene(vehicleLaneScene(), {
      maxAgents: 60,
    });
    engine.start();
    engine.step(60);
    expect(engine.snapshot().vehicles ?? []).not.toEqual([]);

    engine.updateScene(vehicleLaneScene({ vehicleAccessible: false }));

    expect(engine.snapshot().vehicles).toEqual([]);
    // The edit itself must not throw stepping afterwards (a dangling
    // vehicle referencing a road no longer in `roads` would).
    expect(() => engine.step(10)).not.toThrow();
  });

  it("clears vehicles on reset, same as it clears agents", () => {
    const engine = createSimulationEngineFromScene(vehicleLaneScene(), {
      maxAgents: 60,
    });
    engine.start();
    engine.step(60);
    expect(engine.snapshot().vehicles ?? []).not.toEqual([]);

    engine.reset();

    expect(engine.snapshot().vehicles).toEqual([]);
  });
});
