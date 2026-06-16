import { describe, expect, it } from "vitest";
import { createRuntimeConvergenceReport } from "./simulationRuntimeConvergence";

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
      status: "complete",
    });
    expect(report.every((item) => item.evidence.length > 0)).toBe(true);
  });
});
