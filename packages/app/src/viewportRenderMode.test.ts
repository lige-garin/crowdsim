import { describe, expect, it } from "vitest";
import { describeViewportRenderMode } from "./viewportRenderMode";

describe("describeViewportRenderMode (ADR-0006 mode badge)", () => {
  it("labels the full GPU path without a caveat", () => {
    expect(describeViewportRenderMode("full-gpu", "zh")).toEqual({
      label: "完整 GPU 模式",
    });
    expect(describeViewportRenderMode("full-gpu", "en")).toEqual({
      label: "Full GPU mode",
    });
  });

  it("labels the compatibility path as CPU + scale-limited with an honesty caveat", () => {
    const zh = describeViewportRenderMode("compat", "zh");
    expect(zh?.label).toContain("兼容模式");
    expect(zh?.label).toContain("规模受限");
    expect(zh?.caveat).toContain("非校准分析");

    const en = describeViewportRenderMode("compat", "en");
    expect(en?.label).toContain("Compatibility mode");
    expect(en?.label).toContain("scale-limited");
    expect(en?.caveat).toContain("not calibrated");
  });

  it("shows no badge while detecting or when WebGPU is unsupported", () => {
    expect(describeViewportRenderMode("detecting", "zh")).toBeNull();
    expect(describeViewportRenderMode("unsupported", "en")).toBeNull();
  });
});
