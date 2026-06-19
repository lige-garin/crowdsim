export function exclusiveScanCpu(counts: Uint32Array): Uint32Array {
  const out = new Uint32Array(counts.length + 1);
  let running = 0;
  for (let i = 0; i < counts.length; i++) {
    out[i] = running;
    running += counts[i];
  }
  out[counts.length] = running;
  return out;
}
