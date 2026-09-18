/**
 * Fruin's pedestrian level of service (LOS A–F).
 *
 * SOURCE: J. J. Fruin, "Pedestrian Planning and Design" (1971). Fruin defines
 * each level by the floor area available to each person, in square feet; the
 * bands below are those areas converted to people per square metre
 * (1 ft² = 0.0929 m²; density = 1 / area). This is the scale pedestrian
 * consultants and commercial crowd tools colour density maps with.
 *
 * | LOS | walkway, ft²/person | queuing, ft²/person |
 * | --- | ------------------- | ------------------- |
 * | A   | ≥ 35                | ≥ 13                |
 * | B   | 25 – 35             | 10 – 13             |
 * | C   | 15 – 25             | 7 – 10              |
 * | D   | 10 – 15             | 3 – 7               |
 * | E   | 5 – 10              | 2 – 3               |
 * | F   | < 5                 | < 2                 |
 */
export type FruinLevel = "A" | "B" | "C" | "D" | "E" | "F";
export type FruinSetting = "walkway" | "queuing";

export const fruinLevels: readonly FruinLevel[] = ["A", "B", "C", "D", "E", "F"];

const SQUARE_METERS_PER_SQUARE_FOOT = 0.09290304;
const areaBreaksSquareFeet: Record<FruinSetting, readonly number[]> = {
  walkway: [35, 25, 15, 10, 5],
  queuing: [13, 10, 7, 3, 2],
};

/**
 * Upper density (people/m²) of each level A–E for a setting; F is above the
 * last one.
 */
export function fruinDensityBreaks(setting: FruinSetting): readonly number[] {
  return areaBreaksSquareFeet[setting].map(
    (squareFeet) => 1 / (squareFeet * SQUARE_METERS_PER_SQUARE_FOOT),
  );
}

const breaksBySetting: Record<FruinSetting, readonly number[]> = {
  walkway: fruinDensityBreaks("walkway"),
  queuing: fruinDensityBreaks("queuing"),
};

/** The level for a density in people per square metre. */
export function fruinLevel(
  densityPerSquareMeter: number,
  setting: FruinSetting = "walkway",
): FruinLevel {
  const breaks = breaksBySetting[setting];
  for (let index = 0; index < breaks.length; index++) {
    if (densityPerSquareMeter <= breaks[index]) return fruinLevels[index];
  }
  return "F";
}

/**
 * Map colours for each level: greens for free movement, amber where people
 * start to adjust their pace, red where movement breaks down. The usual
 * LOS-map convention.
 */
export const fruinColours: Record<FruinLevel, string> = {
  A: "#1a9850",
  B: "#91cf60",
  C: "#d9ef8b",
  D: "#fee08b",
  E: "#fc8d59",
  F: "#d73027",
};
