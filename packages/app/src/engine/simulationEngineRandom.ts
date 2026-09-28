export function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) {
    return 0;
  }

  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count++;
    product *= rng();
  } while (product > limit);

  return count - 1;
}

/**
 * Mulberry32: the one seeded generator in the app. The state wraps to 32 bits
 * on every draw; an earlier copy let it grow as a double, which drifts from the
 * reference sequence once it passes 2^53, a few million draws into a long run.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
