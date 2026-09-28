import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScenarioDiffMetricChart } from "./ScenarioDiffMetricChart";
import type { MetricComparison } from "../analytics/scenarioDiffReport";

afterEach(cleanup);

const metric = (overrides: Partial<MetricComparison> = {}): MetricComparison => ({
  delta: 2,
  deltaPercent: 20,
  direction: "lowerIsBetter",
  key: "peakDensity",
  label: "Peak density",
  scenarioAValue: 10,
  scenarioBValue: 12,
  unit: "P/m²",
  ...overrides,
});

describe("ScenarioDiffMetricChart", () => {
  it("marks a rise as worse when lower is better", () => {
    render(
      <ScenarioDiffMetricChart
        metric={metric({ delta: 2, direction: "lowerIsBetter" })}
        scenarioAName="Alpha"
        scenarioBName="Beta"
      />,
    );

    const badge = screen.getByText(/▲/);
    expect(badge).toHaveClass("scenario-diff-worse");
  });

  it("marks a fall as improved when lower is better", () => {
    render(
      <ScenarioDiffMetricChart
        metric={metric({ delta: -2, deltaPercent: -20, direction: "lowerIsBetter" })}
        scenarioAName="Alpha"
        scenarioBName="Beta"
      />,
    );

    const badge = screen.getByText(/▼/);
    expect(badge).toHaveClass("scenario-diff-better");
  });

  it("shows neither arrow nor colour when nothing changed, matching the printable report's own zero-delta behaviour", () => {
    render(
      <ScenarioDiffMetricChart
        metric={metric({ delta: 0, deltaPercent: 0, scenarioBValue: 10 })}
        scenarioAName="Alpha"
        scenarioBName="Beta"
      />,
    );

    expect(screen.queryByText(/▲/)).toBeNull();
    expect(screen.queryByText(/▼/)).toBeNull();
    expect(document.querySelector(".scenario-diff-better")).toBeNull();
    expect(document.querySelector(".scenario-diff-worse")).toBeNull();
  });
});
