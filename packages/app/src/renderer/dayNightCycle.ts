import { MathUtils } from "three";
import { lerp } from "../numberUtils";

/**
 * The city view's day. At 120 simulated seconds per day the whole viewport went
 * dark every two minutes — at 8x speed, every fifteen seconds — which reads as
 * a flickering render rather than a living city. A day of 24 simulated minutes
 * lets a session sit in daylight while still showing dusk and night.
 */
export const CITY_DAY_LENGTH_SECONDS = 24 * 60;

/** Fraction of the day, 0 at midnight. */
function dayPhase(clockSeconds: number) {
  return (
    MathUtils.euclideanModulo(clockSeconds, CITY_DAY_LENGTH_SECONDS) /
    CITY_DAY_LENGTH_SECONDS
  );
}

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
export function dayNightLighting(clockSeconds: number): DayNightLighting {
  const sun = sunLevel(clockSeconds);

  return {
    keyColor: lerpColor([90, 110, 150], [255, 250, 240], sun),
    keyIntensity: lerp(0.15, 1.5, sun),
    ambientIntensity: lerp(0.12, 0.5, sun),
    hemiSky: lerpColor([22, 36, 60], [207, 224, 238], sun),
    hemiGround: lerpColor([8, 14, 20], [22, 36, 46], sun),
    hemiIntensity: lerp(0.35, 1.2, sun),
  };
}

/** 0 at midnight, 1 at midday — the same curve the lights follow. */
export function sunLevel(clockSeconds: number): number {
  return (1 - Math.cos(dayPhase(clockSeconds) * Math.PI * 2)) / 2;
}

/**
 * Where the key light shines from, as a unit vector in render space (z up,
 * −y is south). The sun rises in the east (+x) at a quarter of the day, is
 * highest in the south at midday and sets in the west (−x) at three quarters.
 *
 * It used to be fixed in the south-west, so shadows pointed the same way at
 * dawn, noon and midnight. At night the key light stands in for moonlight, so
 * its height never drops below 0.3: a light on the horizon would stretch every
 * shadow across the city.
 */
export function sunDirection(clockSeconds: number): {
  x: number;
  y: number;
  z: number;
} {
  // 0 at sunrise, π/2 at noon, π at sunset.
  const arc = (dayPhase(clockSeconds) - 0.25) * Math.PI * 2;
  const x = Math.cos(arc);
  const y = -0.45;
  const z = Math.max(0.3, Math.sin(arc));
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}
