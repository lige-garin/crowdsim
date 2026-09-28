import { stepSocialForceCpu } from "@crowdsim/core-gpu";
import { describe, expect, it } from "vitest";
import {
  compareMovementBackends,
  createCpuMovementBackend,
  createMovementBackendProbeFixture,
  createMovementBackendReadinessSummary,
  type MovementBackend,
} from "./movementBackend";

describe("movement backend contract", () => {
  it("keeps the CPU backend compatible with the existing social-force step", async () => {
    const fixture = createMovementBackendProbeFixture();
    const backendResult = await createCpuMovementBackend().step(fixture);
    const directResult = stepSocialForceCpu(
      fixture.agents,
      fixture.targetPositions,
      fixture.walls,
      fixture.params,
    );

    expect(Array.from(backendResult.positions)).toEqual(
      Array.from(directResult.positions),
    );
    expect(Array.from(backendResult.velocities)).toEqual(
      Array.from(directResult.velocities),
    );
  });

  it("marks candidate backends ready only when they align with CPU", async () => {
    const fixture = createMovementBackendProbeFixture();
    const cpu = createCpuMovementBackend();
    const alignedCandidate: MovementBackend = {
      id: "webgpu-ready",
      mode: "ready",
      step: (input) => cpu.step(input),
    };
    const alignment = await compareMovementBackends(cpu, alignedCandidate, fixture);

    expect(alignment.matches).toBe(true);
    expect(alignment.positionsDelta).toBe(0);
    expect(alignment.velocitiesDelta).toBe(0);
  });

  it("reports mismatch deltas for movement backend gates", async () => {
    const fixture = createMovementBackendProbeFixture();
    const cpu = createCpuMovementBackend();
    const mismatchedCandidate: MovementBackend = {
      id: "webgpu-ready",
      mode: "ready",
      step: async (input) => {
        const result = await cpu.step(input);
        const positions = new Float32Array(result.positions);

        positions[0] += 0.01;

        return {
          positions,
          velocities: result.velocities,
        };
      },
    };
    const alignment = await compareMovementBackends(cpu, mismatchedCandidate, fixture);

    expect(alignment.matches).toBe(false);
    expect(alignment.positionsDelta).toBeGreaterThan(0.001);
    expect(
      createMovementBackendReadinessSummary({
        activeBackend: "cpu-compat",
        readyBackend: "cpu-compat",
        status: "error",
      }),
    ).toBe("active=cpu-compat | ready=cpu-compat | status=error");
  });
});
