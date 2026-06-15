import { afterEach, describe, expect, it } from "vitest";
import { runWebGpuProbe } from "./webgpuProbe";

const originalGpu = navigator.gpu;

describe("runWebGpuProbe", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: originalGpu,
    });
  });

  it("reports unsupported browsers without throwing", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });

    await expect(runWebGpuProbe()).resolves.toEqual({
      status: "unsupported",
      supported: false,
      input: [1, 2, 3, 4],
      output: [],
      message: "WebGPU unavailable",
    });
  });
});
