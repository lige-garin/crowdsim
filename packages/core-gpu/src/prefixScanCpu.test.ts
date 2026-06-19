import { describe, expect, it } from "vitest";
import { exclusiveScanCpu } from "./prefixScanCpu";

describe("exclusiveScanCpu", () => {
  it("produces exclusive offsets with total appended", () => {
    const out = exclusiveScanCpu(new Uint32Array([2, 1, 0, 1]));
    expect(Array.from(out)).toEqual([0, 2, 3, 3, 4]);
  });

  it("handles empty and single-element inputs", () => {
    expect(Array.from(exclusiveScanCpu(new Uint32Array([])))).toEqual([0]);
    expect(Array.from(exclusiveScanCpu(new Uint32Array([5])))).toEqual([0, 5]);
  });

  it("matches the cellOffsets contract for a larger random count array", () => {
    const counts = new Uint32Array([3, 0, 5, 2, 0, 0, 7, 1]);
    const out = exclusiveScanCpu(counts);
    // out[i] = sum of counts before i; last entry = grand total
    let running = 0;
    for (let i = 0; i < counts.length; i++) {
      expect(out[i]).toBe(running);
      running += counts[i];
    }
    expect(out[counts.length]).toBe(running);
    expect(running).toBe(18);
  });
});
