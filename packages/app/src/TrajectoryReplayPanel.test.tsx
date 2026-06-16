import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import type { SimulationSnapshot } from "./simulationEngine";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
} from "./trajectoryRecording";
import { TrajectoryReplayPanel } from "./TrajectoryReplayPanel";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TrajectoryReplayPanel", () => {
  it("renders live trajectory recording readiness", () => {
    const recording = [snapshot(0, 1), snapshot(2, 1), snapshot(3, 2)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({
        id: "live-recording",
        runtime: {
          decisionBackend: "wasm-ready",
          sharedMemory: "sab",
          thread: "worker",
        },
        sceneId: "atrium-demo",
        seed: 1,
      }),
    );

    render(
      <I18nProvider>
        <TrajectoryReplayPanel recording={recording} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "记录 / 回放" })).toBeInTheDocument();
    expect(screen.getByText(/frames 3/)).toBeInTheDocument();
    expect(screen.getByText(/agents 2/)).toBeInTheDocument();
    expect(screen.getByText(/runtime worker\/sab/)).toBeInTheDocument();
  });
});

function snapshot(elapsedSeconds: number, agentId: number): SimulationSnapshot {
  return {
    agentCount: 1,
    agents: [
      {
        id: agentId,
        targetX: 10,
        targetY: 0,
        vx: 1,
        vy: 0,
        x: elapsedSeconds,
        y: elapsedSeconds / 2,
      },
    ],
    elapsedSeconds,
    exitedCount: 0,
    spawnedCount: agentId,
    status: "running",
    stepCount: elapsedSeconds * 10,
    timeScale: 1,
  };
}
