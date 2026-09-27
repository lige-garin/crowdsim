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
        dashboardSamples={[]}
        journeyDurations={() => []}
        language="en"
        minuteFlows={() => []}
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
        dashboardSamples={[]}
        journeyDurations={analytics.journeyDurations}
        language="zh"
        minuteFlows={analytics.minuteFlows}
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

  it("draws a flow chart per count line, sized by that line's own minute flows", () => {
    const analytics = createRunAnalytics();
    analytics.record(scene, at(1, 19));
    analytics.record(scene, at(2, 21));
    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={analytics.journeyDurations}
        language="en"
        minuteFlows={analytics.minuteFlows}
        onExport={vi.fn()}
        scene={scene}
        summary={analytics.summary()}
      />,
    );

    const chart = screen
      .getByTestId("count-line-gate")
      .querySelector(".echart-container");
    expect(chart).not.toBeNull();
    expect(chart).toHaveAttribute("aria-label", expect.stringContaining("Main gate"));
  });

  it("draws a journey-time histogram once at least one journey has completed", () => {
    const analytics = createRunAnalytics();
    analytics.record(scene, at(1, 19));
    analytics.record(scene, at(2, 21));
    // The agent is absent from this sample: the journey it was tracking is
    // now complete, which is what makes `summary().journeys.count > 0`.
    analytics.record(scene, {
      agentCount: 0,
      agents: [],
      elapsedSeconds: 3,
      exitedCount: 1,
      spawnedCount: 1,
      status: "running",
      stepCount: 0,
      timeScale: 1,
    });
    const summary = analytics.summary();
    expect(summary.journeys.count).toBeGreaterThan(0);

    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={analytics.journeyDurations}
        language="en"
        minuteFlows={analytics.minuteFlows}
        onExport={vi.fn()}
        scene={scene}
        summary={summary}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Journey time distribution" }),
    ).toBeInTheDocument();
  });

  it("draws a ranking chart once there is at least one stay or wait", () => {
    const summary = createRunAnalytics().summary();
    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={() => []}
        language="en"
        minuteFlows={() => []}
        onExport={vi.fn()}
        scene={scene}
        summary={{
          ...summary,
          places: [
            {
              kind: "browse",
              p50Seconds: 12,
              p90Seconds: 18,
              peakConcurrent: 3,
              placeId: "cafe",
              visits: 20,
            },
          ],
          samples: 1,
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Stays and waits ranking" }),
    ).toBeInTheDocument();
  });

  it("draws the population strip from the live dashboard samples, not the measured summary", () => {
    render(
      <RunAnalyticsPanel
        dashboardSamples={[
          { agentCount: 12, elapsedSeconds: 1, exitedCount: 0 },
          { agentCount: 18, elapsedSeconds: 2, exitedCount: 0 },
        ]}
        journeyDurations={() => []}
        language="en"
        minuteFlows={() => []}
        onExport={vi.fn()}
        scene={scene}
        summary={createRunAnalytics().summary()}
      />,
    );

    const strip = screen.getByTestId("realtime-strip");
    expect(strip.querySelector("canvas")).not.toBeNull();
    expect(strip).toHaveTextContent("18");
  });
});

describe("Fruin LOS gauge", () => {
  it("draws a needle at the real peak density from the summary, not a fixture", () => {
    const analytics = createRunAnalytics();
    // One agent alone in a 2m density cell -> 1 person / 4 m^2 = 0.25 P/m^2
    // (runAnalytics.test.ts's own precedent for this exact recipe).
    analytics.record(scene, at(1, 19));
    const summary = analytics.summary();
    expect(summary.levelOfService.peakDensity).toBeCloseTo(0.25, 6);

    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={analytics.journeyDurations}
        language="zh"
        minuteFlows={analytics.minuteFlows}
        onExport={vi.fn()}
        scene={scene}
        summary={summary}
      />,
    );

    const gauge = document.querySelector(".fruin-los-gauge");
    expect(gauge).not.toBeNull();
    expect(gauge!.getAttribute("aria-label")).toBe(
      `${summary.levelOfService.peakDensity.toFixed(2)} P/m² · ${summary.levelOfService.peakLevel}`,
    );
    // Six A-F band arcs, always drawn regardless of where the needle sits.
    expect(gauge!.querySelectorAll("path")).toHaveLength(6);
  });

  it("moves the needle when a second, denser run reports a higher peak", () => {
    const sparse = createRunAnalytics();
    sparse.record(scene, at(1, 19));
    const denseSnapshot: SimulationSnapshot = {
      agentCount: 4,
      agents: [
        { id: 1, targetX: 40, targetY: 10, vx: 0, vy: 0, x: 19, y: 10 },
        { id: 2, targetX: 40, targetY: 10, vx: 0, vy: 0, x: 19.2, y: 10 },
        { id: 3, targetX: 40, targetY: 10, vx: 0, vy: 0, x: 19.4, y: 10 },
        { id: 4, targetX: 40, targetY: 10, vx: 0, vy: 0, x: 19.6, y: 10 },
      ],
      elapsedSeconds: 1,
      exitedCount: 0,
      spawnedCount: 4,
      status: "running",
      stepCount: 0,
      timeScale: 1,
    };
    const dense = createRunAnalytics();
    dense.record(scene, denseSnapshot);

    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={sparse.journeyDurations}
        language="zh"
        minuteFlows={sparse.minuteFlows}
        onExport={vi.fn()}
        scene={scene}
        summary={sparse.summary()}
      />,
    );
    const sparseNeedle = document.querySelector(".fruin-los-gauge line")!;
    const sparseX = Number(sparseNeedle.getAttribute("x2"));
    cleanup();

    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={dense.journeyDurations}
        language="zh"
        minuteFlows={dense.minuteFlows}
        onExport={vi.fn()}
        scene={scene}
        summary={dense.summary()}
      />,
    );
    const denseNeedle = document.querySelector(".fruin-los-gauge line")!;
    const denseX = Number(denseNeedle.getAttribute("x2"));

    expect(dense.summary().levelOfService.peakDensity).toBeGreaterThan(
      sparse.summary().levelOfService.peakDensity,
    );
    expect(denseX).toBeGreaterThan(sparseX);
  });
});

describe("what the measured numbers are", () => {
  it("says they come from one run and carry no interval", () => {
    render(
      <RunAnalyticsPanel
        dashboardSamples={[]}
        journeyDurations={() => []}
        language="zh"
        minuteFlows={() => []}
        onExport={vi.fn()}
        scene={scene}
        summary={createRunAnalytics().summary()}
      />,
    );

    const note = screen.getByTestId("run-analytics-single-run").textContent ?? "";

    expect(note).toContain("单一种子");
    expect(note).toContain("不带置信区间");
    // And it points at the place that can give one.
    expect(note).toContain("参数扫描");
  });
});
