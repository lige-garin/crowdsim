import { mulberry32 } from "./simulationEngineRandom";

export type BlueprintBuilding = {
  /** Building centre in scene/world coordinates. */
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
};

// Night-city facade tones (cool glass + warm concrete) that read well against
// the dark viewport, with lit windows added at render time.
const PALETTE = [
  "#3c4d68",
  "#47597b",
  "#56677f",
  "#6b5f53",
  "#5f6e57",
  "#7c8694",
  "#34536e",
  "#8a7c6a",
  "#455b6e",
  "#6c7589",
];

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
  const margin = 6;
  const lot = 15;
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
      const width = 9 + rng() * 4.5;
      const depth = 9 + rng() * 4.5;
      // Skewed toward mid-rise with the occasional tower (rng*rng biases low).
      const height = 9 + rng() * rng() * 56;
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
