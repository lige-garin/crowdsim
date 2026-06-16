import { describe, expect, it } from "vitest";
import {
  createRuntimeConvergenceAudit,
  createRuntimeConvergenceReport,
} from "./simulationRuntimeConvergence";

describe("simulation runtime convergence", () => {
  it("tracks phase 2 kernel convergence evidence explicitly", () => {
    const report = createRuntimeConvergenceReport();

    expect(report.map((item) => item.id)).toEqual([
      "webgpu-movement",
      "wasm-decision",
      "worker-thread",
      "sab-metrics",
      "benchmark-replay-validation",
    ]);
    expect(
      report.filter((item) => item.status === "complete").map((item) => item.id),
    ).toEqual([
      "webgpu-movement",
      "wasm-decision",
      "worker-thread",
      "sab-metrics",
      "benchmark-replay-validation",
    ]);
    expect(report.find((item) => item.id === "sab-metrics")).toMatchObject({
      blocksFinalUi: false,
      completionPercent: 100,
      status: "complete",
    });
    expect(report.every((item) => item.evidence.length > 0)).toBe(true);
  });

  it("separates non-blocking runtime limitations from final UI blockers", () => {
    const report = createRuntimeConvergenceReport();
    const audit = createRuntimeConvergenceAudit(report);

    expect(report.every((item) => item.completionPercent === 100)).toBe(true);
    expect(report.every((item) => item.blocksFinalUi === false)).toBe(true);
    expect(
      report
        .flatMap((item) => item.limitations)
        .some((limitation) => limitation.includes("Structured-clone snapshots")),
    ).toBe(true);
    expect(audit).toEqual({
      blocksFinalUi: false,
      completeCount: 5,
      completionPercent: 100,
      itemCount: 5,
      remainingBlockers: [],
    });
  });
});
