import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import {
  createOrchestratorReadinessSummary,
  createSimulationOrchestrator,
} from "./simulationOrchestrator";

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
});
