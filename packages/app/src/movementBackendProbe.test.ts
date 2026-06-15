import { describe, expect, it } from "vitest";
import {
  createMovementBackendSummary,
  type MovementBackendProbeResult,
} from "./movementBackendProbe";

describe("movement backend probe summary", () => {
  it("keeps active CPU movement separate from WebGPU readiness", () => {
    const result: MovementBackendProbeResult = {
      activeBackend: "cpu-compat",
      message: "WebGPU movement readback verified",
      positions: [0.1, 0],
      readyBackend: "webgpu-ready",
      status: "ready",
      velocities: [1, 0],
    };

    expect(createMovementBackendSummary(result)).toBe(
      "active=cpu-compat | ready=webgpu-ready | status=ready",
    );
  });
});
