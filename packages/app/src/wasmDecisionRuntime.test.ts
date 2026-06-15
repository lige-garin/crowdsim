import { describe, expect, it } from "vitest";
import {
  calculateDecisionTickCount,
  createDecisionBackendValue,
  createWasmDecisionRuntimeState,
} from "./wasmDecisionRuntime";

describe("wasmDecisionRuntime", () => {
  it("maps 60Hz movement steps to 10Hz decision ticks", () => {
    expect(calculateDecisionTickCount(0)).toBe(0);
    expect(calculateDecisionTickCount(5)).toBe(0);
    expect(calculateDecisionTickCount(6)).toBe(1);
    expect(calculateDecisionTickCount(60)).toBe(10);
  });

  it("reports wasm-ready only after the runtime is ready", () => {
    expect(
      createDecisionBackendValue(
        createWasmDecisionRuntimeState({
          status: "ready",
        }),
      ),
    ).toBe("wasm-ready @ 10Hz");
    expect(
      createDecisionBackendValue(
        createWasmDecisionRuntimeState({
          message: "init failed",
          status: "error",
        }),
      ),
    ).toBe("rule-ts fallback @ 10Hz");
  });
});
