/**
 * Who a person in the crowd looks like.
 *
 * HONESTY NOTE: this is appearance only. The simulation has no age or sex —
 * every agent's speed is drawn from the same distribution regardless of
 * demographic archetype (`behaviorDistributions.sampleSpeedFactor`, a
 * Weidmann-shaped spread around the free-flow mean, not one fixed speed for
 * everyone) — and the mix below is self-authored for a shopping street, not
 * calibrated against any count.
 * (The sourced IMO population in `pedestrianPresets` describes ship passengers:
 * 40% mobility-impaired and no children, so it is the wrong crowd to borrow.)
 * Letting these groups change walking speed is a model change, not a visual one.
 *
 * Appearance is a pure function of the agent id and the scene seed, so the
 * same person looks the same in every frame, after a hot scene update, and on
 * both the worker and main-thread paths.
 */
import { mulberry32 } from "./simulationEngineRandom";

export type FigureArchetype = "man" | "woman" | "child" | "elderMan" | "elderWoman";

/** Self-authored visual mix; sums to 1. */
export const figureMix: Record<FigureArchetype, number> = {
  man: 0.34,
  woman: 0.36,
  child: 0.12,
  elderMan: 0.08,
  elderWoman: 0.1,
};

export const figureArchetypes = Object.keys(figureMix) as readonly FigureArchetype[];

export type FigureLook = {
  archetype: FigureArchetype;
  /** Multiplies the archetype's base height: people are not all one size. */
  heightScale: number;
  /** Linear RGB 0–1. */
  skin: [number, number, number];
  /** Trousers or skirt-legs colour, sRGB 0–1. */
  legs: [number, number, number];
  /** Shirt, jacket or dress colour, sRGB 0–1. */
  top: [number, number, number];
  /** Offsets the walk cycle so a crowd does not step in lockstep. */
  stridePhase: number;
};

const skinTones: [number, number, number][] = [
  [0.96, 0.8, 0.69],
  [0.91, 0.72, 0.58],
  [0.8, 0.6, 0.45],
  [0.64, 0.45, 0.32],
  [0.46, 0.31, 0.22],
];

const topColours: [number, number, number][] = [
  [0.93, 0.93, 0.9],
  [0.78, 0.2, 0.2],
  [0.16, 0.24, 0.42],
  [0.25, 0.5, 0.35],
  [0.9, 0.75, 0.3],
  [0.45, 0.47, 0.5],
  [0.12, 0.12, 0.13],
  [0.85, 0.55, 0.62],
  [0.78, 0.7, 0.58],
  [0.35, 0.55, 0.75],
  [0.55, 0.3, 0.55],
  [0.95, 0.5, 0.25],
];

const legColours: [number, number, number][] = [
  [0.16, 0.2, 0.3],
  [0.22, 0.22, 0.24],
  [0.36, 0.3, 0.24],
  [0.52, 0.5, 0.46],
  [0.12, 0.12, 0.14],
  [0.3, 0.36, 0.46],
];

export function figureLook(agentId: number, seed: number): FigureLook {
  // A stream keyed on (id, seed), so a person looks the same everywhere.
  const random = mulberry32(
    Math.imul(agentId | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca77),
  );
  const pick = random();
  let archetype: FigureArchetype = "man";
  let cumulative = 0;
  for (const candidate of figureArchetypes) {
    cumulative += figureMix[candidate];
    if (pick < cumulative) {
      archetype = candidate;
      break;
    }
  }
  return {
    archetype,
    heightScale: 0.93 + random() * 0.14,
    legs: legColours[Math.floor(random() * legColours.length)],
    skin: skinTones[Math.floor(random() * skinTones.length)],
    stridePhase: random() * Math.PI * 2,
    top: topColours[Math.floor(random() * topColours.length)],
  };
}
