import { parseScene } from "@crowdsim/scene-schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunAnalytics } from "./runAnalytics";
import { RunAnalyticsPanel } from "./RunAnalyticsPanel";
import type { SimulationSnapshot } from "./simulationEngine";

afterEach(cleanup);

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "panel",
  name: "Panel",
  world: { width: 40, height: 20 },
  countLines: [
    {
      id: "gate",
      name: "Main gate",
      geometry: {
        type: "polyline",
        points: [
          { x: 20, y: 0 },
          { x: 20, y: 20 },
        ],
      },
    },
  ],
});

const at = (elapsedSeconds: number, x: number): SimulationSnapshot => ({
  agentCount: 1,
  agents: [{ id: 1, targetX: 40, targetY: 10, vx: 1.3, vy: 0, x, y: 10 }],
  elapsedSeconds,
  exitedCount: 0,
  spawnedCount: 1,
  status: "running",
  stepCount: 0,
  timeScale: 1,
});

describe("RunAnalyticsPanel", () => {
  it("says nothing is measured and disables export before the first sample", () => {
    render(
      <RunAnalyticsPanel
        language="en"
        onExport={vi.fn()}
        scene={scene}
        summary={createRunAnalytics().summary()}
      />,
    );
    expect(screen.getByText(/Nothing measured yet/)).toBeInTheDocument();
    expect(screen.getByTestId("export-flows")).toBeDisabled();
  });

  it("shows line flows and exports the chosen table", () => {
    const analytics = createRunAnalytics();
    analytics.record(scene, at(1, 19));
    analytics.record(scene, at(2, 21));
    const onExport = vi.fn();
    render(
      <RunAnalyticsPanel
        language="zh"
        onExport={onExport}
        scene={scene}
        summary={analytics.summary()}
      />,
    );
    expect(screen.getByTestId("count-line-gate")).toHaveTextContent("Main gate");
    expect(screen.getByRole("img", { name: /服务水平/ })).toHaveTextContent("A");
    fireEvent.click(screen.getByTestId("export-journeys"));
    expect(onExport).toHaveBeenCalledWith("journeys");
  });
});
