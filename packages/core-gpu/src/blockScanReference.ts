import { exclusiveScanCpu } from "./prefixScanCpu";

// CPU mirror of the GPU block-scan algorithm in gpuSimCoreShaders.ts (scan_blocks
// + add_block_offsets): a per-workgroup exclusive scan, per-block totals, then add
// the totals of all preceding blocks. It exists so the BLOCKED decomposition (the
// cross-block accumulation that is the easiest place for an off-by-one in the WGSL)
// can be checked against the simple exclusiveScanCpu oracle in Node, without a GPU.
// This validates the ALGORITHM only; it does NOT verify the WGSL itself -- that
// still requires `pnpm test:webgpu` on real hardware.
export function blockScanReference(
  counts: Uint32Array,
  workgroup = 256,
): Uint32Array {
  const n = counts.length;
  const offsets = new Uint32Array(n + 1);
  const numBlocks = Math.max(1, Math.ceil(n / workgroup));
  const blockTotals = new Uint32Array(numBlocks);

  // scan_blocks: exclusive scan within each block; blockTotals[b] = inclusive sum.
  for (let block = 0; block < numBlocks; block++) {
    let running = 0;
    for (let lid = 0; lid < workgroup; lid++) {
      const i = block * workgroup + lid;
      const value = i < n ? counts[i] : 0;
      if (i < n) {
        offsets[i] = running;
      }
      running += value;
    }
    blockTotals[block] = running;
  }

  // add_block_offsets: offsets[i] += sum of all preceding block totals.
  for (let i = 0; i < n; i++) {
    const block = Math.floor(i / workgroup);
    let acc = 0;
    for (let b = 0; b < block; b++) {
      acc += blockTotals[b];
    }
    offsets[i] += acc;
  }
  if (n > 0) {
    offsets[n] = offsets[n - 1] + counts[n - 1];
  }

  return offsets;
}

// Convenience: assert the blocked algorithm agrees with the simple oracle.
export function blockScanMatchesOracle(
  counts: Uint32Array,
  workgroup = 256,
): boolean {
  const blocked = blockScanReference(counts, workgroup);
  const oracle = exclusiveScanCpu(counts);
  if (blocked.length !== oracle.length) {
    return false;
  }
  return blocked.every((value, index) => value === oracle[index]);
}
