/** Seconds of simulation time that make up one full day→night→day cycle. */
export const DAY_LENGTH_SECONDS = 120;

export type DayNightLighting = {
  /** Directional key-light colour and intensity. */
  keyColor: string;
  keyIntensity: number;
  /** Flat ambient fill intensity. */
  ambientIntensity: number;
  /** Hemisphere sky/ground colours and intensity. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
};

type Rgb = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(night: Rgb, day: Rgb, t: number): string {
  const channel = (i: number) => {
    const value = Math.round(lerp(night[i], day[i], t));
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * Maps the simulation clock to scene lighting so the 3d viewport reads as a
 * living city across day and night. Drives only the lights (key/ambient/
 * hemisphere) — the scene background stays owned by the weather layer to avoid
 * fighting rain/fog tints.
 *
 * phase 0 = midnight (dimmest), phase 0.5 = midday (brightest); the sun height
 * follows a smooth cosine so dawn/dusk transition gently.
 */
export function dayNightLighting(
  clockSeconds: number,
  dayLengthSeconds: number = DAY_LENGTH_SECONDS,
): DayNightLighting {
  const phase =
    (((clockSeconds % dayLengthSeconds) + dayLengthSeconds) % dayLengthSeconds) /
    dayLengthSeconds;
  // sun: 0 at midnight (phase 0/1), 1 at midday (phase 0.5).
  const sun = (1 - Math.cos(phase * Math.PI * 2)) / 2;

  return {
    keyColor: lerpColor([90, 110, 150], [255, 250, 240], sun),
    keyIntensity: lerp(0.15, 1.5, sun),
    ambientIntensity: lerp(0.12, 0.5, sun),
    hemiSky: lerpColor([22, 36, 60], [207, 224, 238], sun),
    hemiGround: lerpColor([8, 14, 20], [22, 36, 46], sun),
    hemiIntensity: lerp(0.35, 1.2, sun),
  };
}
