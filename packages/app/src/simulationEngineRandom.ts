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

export function createSeededRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
