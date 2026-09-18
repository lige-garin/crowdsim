import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveCrowd } from "./liveCrowd";
import type { SimulationSnapshot } from "./simulationEngine";
import { TrajectoryReplayBar } from "./TrajectoryReplayBar";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
} from "./trajectoryRecording";

afterEach(cleanup);

const at = (elapsedSeconds: number, people: number): SimulationSnapshot => ({
  agentCount: people,
  agents: Array.from({ length: people }, (_, id) => ({
    id,
    targetX: 0,
    targetY: 0,
    vx: 1,
    vy: 0,
    x: elapsedSeconds,
    y: id,
  })),
  elapsedSeconds,
  exitedCount: 0,
  spawnedCount: people,
  status: "running",
  stepCount: 0,
  timeScale: 1,
});

describe("TrajectoryReplayBar", () => {
  it("opens at the end of the run and scrubbing puts that moment's crowd in the views", () => {
    const recording = [at(0, 1), at(10, 3)].reduce(
      (current, snapshot) => appendTrajectoryFrame(current, snapshot),
      createTrajectoryRecording({ id: "r", sceneId: "s", seed: 1 }),
    );
    const crowd = createLiveCrowd({});
    const onExport = vi.fn();
    render(
      <TrajectoryReplayBar
        crowd={crowd}
        language="en"
        onClose={vi.fn()}
        onExport={onExport}
        recording={recording}
      />,
    );

    expect(crowd.get().snapshot?.agentCount).toBe(3);
    expect(screen.getByText("00:10 / 00:10")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Replay time" }), {
      target: { value: "0" },
    });
    expect(crowd.get().snapshot?.agentCount).toBe(1);
    expect(screen.getByTestId("replay-agent-count")).toHaveTextContent("1 people");

    fireEvent.click(screen.getByTestId("export-trajectories"));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
