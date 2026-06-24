import { describe, expect, it } from "vitest";
import { blockScanReference } from "./blockScanReference";
import { exclusiveScanCpu } from "./prefixScanCpu";

// The GPU scan uses 256-wide workgroups. Cross-block accumulation is the riskiest
// part of the WGSL; here we check the algorithm (not the shader) against the
// simple oracle across single-block and multi-block sizes.
describe("blockScanReference (GPU block-scan algorithm vs oracle)", () => {
  const sizes = [0, 1, 4, 255, 256, 257, 512, 513, 1000, 2048];

  for (const size of sizes) {
    it(`matches exclusiveScanCpu for n=${size} (workgroup 256)`, () => {
      const counts = new Uint32Array(size);
      for (let i = 0; i < size; i++) {
        // deterministic, varied, with zeros sprinkled in
        counts[i] = i % 5 === 0 ? 0 : (i * 7 + 3) % 11;
      }
      const blocked = blockScanReference(counts, 256);
      const oracle = exclusiveScanCpu(counts);
      expect(Array.from(blocked)).toEqual(Array.from(oracle));
    });
  }

  it("accumulates across blocks (multi-block totals are added)", () => {
    // 300 cells each holding 1 -> offsets must be 0,1,2,...,300 across the
    // 256-boundary, proving block 1 picks up block 0's total of 256.
    const counts = new Uint32Array(300).fill(1);
    const blocked = blockScanReference(counts, 256);
    expect(blocked[256]).toBe(256);
    expect(blocked[299]).toBe(299);
    expect(blocked[300]).toBe(300);
  });

  it("works with a smaller workgroup that forces many blocks", () => {
    const counts = new Uint32Array([2, 0, 1, 3, 0, 4, 1, 1, 2]);
    expect(Array.from(blockScanReference(counts, 4))).toEqual(
      Array.from(exclusiveScanCpu(counts)),
    );
  });
});
