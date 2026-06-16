import { describe, expect, it } from "vitest";
import type { DashboardStats } from "./dashboardStats";
import { demoScene } from "./demoScene";
import { createSimulationCredibilityReport } from "./simulationCredibility";
import type { SimulationSnapshot } from "./simulationEngine";

describe("simulationCredibility", () => {
  it("explains constraints, metrics, and export boundaries for live evidence", () => {
    const report = createSimulationCredibilityReport({
      dashboardStats: dashboardStats(),
      evacuation: {
        active: true,
        baselineExited: 0,
        curve: [],
        flowPlan: null,
        label: "Evacuating",
        startedAtSeconds: 0,
      },
      heatmapSamples: [
        {
          agents: [{ id: 1, x: 1, y: 1 }],
          elapsedSeconds: 1,
        },
        {
          agents: [{ id: 1, x: 2, y: 1 }],
          elapsedSeconds: 3,
        },
      ],
      runtime: {
        decisionBackend: "wasm-ready",
        sharedMemory: "sab",
        thread: "worker",
      },
      scene: demoScene,
      simulationSnapshot: snapshot({ agentCount: 12 }),
    });

    expect(report.status).toBe("operational");
    expect(report.constraints).toContain("scene=atrium-demo");
    expect(report.metricExplanation).toContain("densityPeak=4");
    expect(report.exportReplay).toContain("trajectoryWindow=2 samples/2s");
    expect(report.runtime).toContain("decision=wasm-ready@10Hz");
    expect(report.runtime).toContain("thread=worker");
    expect(report.riskNotes[0]).toContain("not certified evacuation approval");
  });

  it("marks the report limited when the runtime agent cap is reached", () => {
    const report = createSimulationCredibilityReport({
      dashboardStats: dashboardStats(),
      evacuation: {
        active: false,
        baselineExited: 0,
        curve: [],
        flowPlan: null,
        label: "Normal",
        startedAtSeconds: 0,
      },
      heatmapSamples: [],
      scene: demoScene,
      simulationSnapshot: snapshot({ agentCount: 2_000 }),
    });

    expect(report.status).toBe("limited");
    expect(report.runtime).toContain("decision=wasm-ready@10Hz");
    expect(report.runtime).toContain("thread=worker");
    expect(report.riskNotes).toContain(
      "Agent cap reached; arrivals are throttled by the browser runtime limit.",
    );
  });
});

function dashboardStats(): DashboardStats {
  return {
    currentAgentCount: 12,
    densityPeak: 4,
    evacuationCompletionSeconds: null,
    evacuationElapsedSeconds: null,
    evacuationStatus: "idle",
    exitedCount: 3,
    populationSeries: [],
    summary: {
      en: "Agents 12",
      zh: "Agents 12",
    },
  };
}

function snapshot(overrides: Partial<SimulationSnapshot>): SimulationSnapshot {
  return {
    agentCount: 0,
    agents: [],
    elapsedSeconds: 0,
    exitedCount: 0,
    spawnedCount: 0,
    status: "paused",
    stepCount: 0,
    timeScale: 1,
    ...overrides,
  };
}
