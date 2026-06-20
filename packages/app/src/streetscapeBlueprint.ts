export type BlueprintBuilding = {
  /** Building centre in scene/world coordinates. */
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
};

const PALETTE = ["#c9d4e3", "#b8c2d0", "#d8cdbf", "#a9b8c4", "#cdbfae", "#bcc7b8"];

/** Deterministic PRNG so the same seed always yields the same block. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic layout of a city block: a grid of varied buildings with a
 * central avenue left open. Shared by the glTF asset generator (so the exported
 * model matches) and unit tests (so the layout is reproducible). All buildings
 * sit inside the world footprint.
 */
export function streetscapeBlueprint(
  world: { width: number; height: number },
  seed: number,
): BlueprintBuilding[] {
  const rng = mulberry32(seed);
  const margin = 8;
  const lot = 26;
  const cols = Math.max(1, Math.floor((world.width - margin * 2) / lot));
  const rows = Math.max(1, Math.floor((world.height - margin * 2) / lot));
  const offsetX = margin + (world.width - margin * 2 - cols * lot) / 2;
  const offsetY = margin + (world.height - margin * 2 - rows * lot) / 2;
  const midRow = Math.floor(rows / 2);

  const buildings: BlueprintBuilding[] = [];
  for (let r = 0; r < rows; r++) {
    if (rows > 2 && r === midRow) {
      continue; // central avenue
    }
    for (let c = 0; c < cols; c++) {
      const width = 12 + rng() * 6;
      const depth = 12 + rng() * 6;
      const height = 6 + rng() * 26;
      const color = PALETTE[Math.floor(rng() * PALETTE.length)] ?? PALETTE[0];
      buildings.push({
        x: offsetX + (c + 0.5) * lot,
        y: offsetY + (r + 0.5) * lot,
        width,
        depth,
        height,
        color,
      });
    }
  }

  return buildings;
}
