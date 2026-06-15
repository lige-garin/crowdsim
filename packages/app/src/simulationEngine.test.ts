import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  createSimulationEngine,
  createSimulationEngineFromScene,
} from "./simulationEngine";

const source = {
  id: "entry",
  position: { x: 0, y: 0 },
  width: 2,
  arrivalRatePerSecond: 60,
};
const sink = {
  id: "exit",
  position: { x: 10, y: 0 },
  radius: 0.5,
};

describe("simulation engine", () => {
  it("does not advance while paused", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 1,
      seed: 7,
      sources: [source],
      sinks: [sink],
    });

    const before = engine.snapshot();
    const after = engine.tick(10);

    expect(after.elapsedSeconds).toBe(before.elapsedSeconds);
    expect(after.agentCount).toBe(0);
    expect(after.spawnedCount).toBe(0);
  });

  it("runs fixed-step simulation with time scale", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 0.5,
      seed: 11,
      sources: [source],
      sinks: [sink],
    });

    engine.setTimeScale(4);
    engine.start();
    const snapshot = engine.tick(0.25);

    expect(snapshot.stepCount).toBe(2);
    expect(snapshot.elapsedSeconds).toBe(1);
    expect(snapshot.spawnedCount).toBeGreaterThan(0);
  });

  it("removes agents once they reach a sink", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 1,
      seed: 19,
      sources: [
        {
          ...source,
          arrivalRatePerSecond: 1,
        },
      ],
      sinks: [sink],
      speedMetersPerSecond: 20,
    });

    engine.start();
    engine.step(4);
    const snapshot = engine.step(1);

    expect(snapshot.spawnedCount).toBeGreaterThan(0);
    expect(snapshot.exitedCount).toBeGreaterThan(0);
    expect(snapshot.agentCount).toBe(snapshot.spawnedCount - snapshot.exitedCount);
  });

  it("resets to a reproducible seeded state", () => {
    const engine = createSimulationEngine({
      fixedDtSeconds: 1,
      seed: 23,
      sources: [source],
      sinks: [sink],
    });

    engine.start();
    const firstRun = engine.step(3);
    engine.reset();
    engine.start();
    const secondRun = engine.step(3);

    expect(secondRun).toMatchObject({
      elapsedSeconds: firstRun.elapsedSeconds,
      stepCount: firstRun.stepCount,
      spawnedCount: firstRun.spawnedCount,
      exitedCount: firstRun.exitedCount,
      agentCount: firstRun.agentCount,
    });
    expect(secondRun.agents.map((agent) => agent.y)).toEqual(
      firstRun.agents.map((agent) => agent.y),
    );
  });

  it("keeps wall-constrained scene agents from crossing blocked geometry", () => {
    const scene = parseScene({
      schemaVersion: "1.0.0",
      id: "wall-stop",
      name: "Wall Stop",
      units: "meters",
      seed: 31,
      world: { width: 10, height: 10 },
      walls: [
        {
          id: "middle-wall",
          geometry: {
            type: "polyline",
            points: [
              { x: 5, y: 0 },
              { x: 5, y: 10 },
            ],
          },
          thickness: 0.2,
        },
      ],
      entrances: [
        {
          id: "entry",
          kind: "source",
          position: { x: 1, y: 5 },
          width: 0.1,
          arrivalRatePerMinute: 600,
        },
        {
          id: "exit",
          kind: "sink",
          position: { x: 9, y: 5 },
          width: 1,
          arrivalRatePerMinute: 0,
        },
      ],
      areas: [],
      targets: [],
      shops: [],
      servicePoints: [],
      countLines: [],
    });
    const engine = createSimulationEngineFromScene(scene, {
      fixedDtSeconds: 1,
      speedMetersPerSecond: 20,
    });

    engine.start();
    const snapshot = engine.step(1);
    const maxX = Math.max(...snapshot.agents.map((agent) => agent.x));

    expect(snapshot.spawnedCount).toBeGreaterThan(0);
    expect(snapshot.exitedCount).toBe(0);
    expect(maxX).toBeLessThan(5);
  });
});
