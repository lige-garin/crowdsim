import { describe, expect, it } from "vitest";
import {
  describeViewportRenderMode,
  describeViewportUnsupported,
} from "./viewportRenderMode";

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

describe("describeViewportUnsupported (blocking notice copy)", () => {
  it("names the cause, what still works, and the requirement in both languages", () => {
    for (const language of ["zh", "en"] as const) {
      const copy = describeViewportUnsupported(language);

      for (const value of Object.values(copy)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }

      expect(copy.reason).toMatch(/WebGPU/);
      expect(copy.requirement).toMatch(/113|18/);
    }
  });

  it("keeps the two languages distinct so neither falls back to the other", () => {
    const zh = describeViewportUnsupported("zh");
    const en = describeViewportUnsupported("en");

    expect(zh.title).not.toEqual(en.title);
    expect(zh.stillWorks).not.toEqual(en.stillWorks);
  });

  it("does not blame the browser when a working renderer crashed", () => {
    for (const language of ["zh", "en"] as const) {
      const failed = describeViewportUnsupported(language, "failed");
      const unsupported = describeViewportUnsupported(language);
      expect(failed.title).not.toBe(unsupported.title);
      expect(failed.reason).not.toMatch(/adapter|适配器/);
    }
    expect(describeViewportRenderMode("failed", "en")).toBeNull();
  });
});
