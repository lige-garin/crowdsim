import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  createOrchestratorReadinessSummary,
  createSimulationOrchestrator,
} from "./simulationOrchestrator";
import { bioCityDemoScene } from "./bioCityDemoScene";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "orchestrator-demo",
  name: "Orchestrator Demo",
  world: { width: 30, height: 20 },
  entrances: [
    {
      id: "entry",
      kind: "source",
      position: { x: 2, y: 10 },
      width: 3,
      arrivalRatePerMinute: 60,
    },
    { id: "exit", kind: "sink", position: { x: 28, y: 10 }, width: 3 },
  ],
  zones: [
    {
      id: "zone-a",
      category: "corridor",
      geometry: {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 0, y: 20 },
        ],
      },
    },
  ],
});

describe("simulation orchestrator", () => {
  it("wraps the current simulation engine with future GPU/WASM cadence metadata", () => {
    const orchestrator = createSimulationOrchestrator(scene);

    orchestrator.start();
    const snapshot = orchestrator.step(12);

    expect(snapshot.movementHz).toBe(60);
    expect(snapshot.decisionHz).toBe(10);
    expect(snapshot.decisionTickCount).toBe(2);
    expect(snapshot.routeCostMap.cells).toHaveLength(1);
    expect(createOrchestratorReadinessSummary(snapshot)).toContain("routeCostCells=1");
  });

  it("runs BioCity decision ticks for BioCity scenes", () => {
    const orchestrator = createSimulationOrchestrator(
      parseScene({
        ...bioCityDemoScene,
        hazards: bioCityDemoScene.hazards.map((hazard) => ({
          ...hazard,
          startsAtSeconds: 0,
        })),
        entrances: [
          {
            id: "bio-entry",
            kind: "source",
            position: { x: 110, y: 70 },
            width: 4,
            arrivalRatePerMinute: 6000,
          },
          {
            id: "bio-exit",
            kind: "sink",
            position: { x: 150, y: 52 },
            width: 6,
          },
        ],
      }),
    );

    orchestrator.start();
    const snapshot = orchestrator.step(6);

    expect(snapshot.agents.length).toBeGreaterThan(0);
    expect(snapshot.agents.some((agent) => agent.lifecycleState)).toBe(true);
    expect(snapshot.routeCostMap.environmentFactorIds).toContain("curbside-pooling");
  });
});
