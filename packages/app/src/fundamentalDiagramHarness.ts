import type { WallSegment } from "@crowdsim/core-gpu";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import type { Router } from "./crowdNavigation";
import { stepCrowd, type SocialForceParameters } from "./crowdMovement";
import { weidmannFundamentalDiagram } from "./pedestrianFundamentalDiagram";
import type { SimulationAgent } from "./simulationEngine";
import { createWallIndex, type WallIndex } from "./wallIndex";

/**
 * Measure the speed–density relation a movement model produces, the way
 * pedestrian models are checked against a fundamental diagram: a straight
 * corridor with walls on both sides, closed into a loop (whoever walks out of
 * one end walks back in at the other), filled to a fixed density, run until it
 * settles, then the mean walking speed along the corridor is recorded.
 *
 * People near either end also appear, shifted by the corridor's length, as
 * "ghosts" at the other end, so nobody sees an empty space ahead of them where
 * the loop joins.
 */
export type CorridorOptions = {
  lengthMeters?: number;
  widthMeters?: number;
  dtSeconds?: number;
  warmupSeconds?: number;
  measureSeconds?: number;
  meanFreeSpeedMetersPerSecond?: number;
  seed?: number;
};

const GHOST_ID_OFFSET = 1_000_000;
const GHOST_BAND_METERS = 2.5;

const straightAhead: Pick<Router, "direction"> = { direction: () => ({ x: 1, y: 0 }) };

/** One movement model's own way of stepping a population forward — `stepCrowd`
 * for social force, `stepCrowdOrca` for `orcaComparison.ts`'s own side of this
 * same measurement. */
export type CorridorStepFn = (input: {
  agents: readonly SimulationAgent[];
  dtSeconds: number;
  walls: WallIndex;
  meanSpeedMetersPerSecond: number;
}) => readonly SimulationAgent[];

/**
 * The periodic-corridor measurement itself, independent of which model
 * steps the crowd — `measureCorridorSpeed` below is social force's own
 * caller of it; `orcaComparison.ts` supplies `stepCrowdOrca` to measure the
 * same benchmark under ORCA, without forking this loop.
 */
export function runPeriodicCorridor(
  step: CorridorStepFn,
  densityPerSquareMeter: number,
  options: CorridorOptions = {},
): number {
  const length = options.lengthMeters ?? 20;
  const width = options.widthMeters ?? 3;
  const dt = options.dtSeconds ?? 1 / 60;
  const seed = options.seed ?? 1;
  const meanSpeed =
    options.meanFreeSpeedMetersPerSecond ??
    weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond;
  const walls: WallSegment[] = [
    { x1: -length, y1: 0, x2: 2 * length, y2: 0 },
    { x1: -length, y1: width, x2: 2 * length, y2: width },
  ];
  const wallIndex = createWallIndex(walls);
  const people = Math.max(1, Math.round(densityPerSquareMeter * length * width));

  // Start on a jittered lattice so nobody begins inside anybody else.
  const columns = Math.max(1, Math.round(Math.sqrt((people * length) / width)));
  const rows = Math.max(1, Math.ceil(people / columns));
  let agents: SimulationAgent[] = Array.from({ length: people }, (_, index) => {
    const id = index + 1;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id,
      radius: sampleBodyRadius(seed, id),
      speedFactor: sampleSpeedFactor(seed, id),
      targetX: 1e9,
      targetY: ((row + 0.5) / rows) * width,
      vx: 0,
      vy: 0,
      x: ((column + 0.5) / columns) * length,
      y: ((row + 0.5) / rows) * width,
    };
  });

  const warmupSteps = Math.round((options.warmupSeconds ?? 8) / dt);
  const measureSteps = Math.round((options.measureSeconds ?? 8) / dt);
  let speedSum = 0;
  let samples = 0;

  for (let stepIndex = 0; stepIndex < warmupSteps + measureSteps; stepIndex++) {
    const ghosts: SimulationAgent[] = [];
    for (const agent of agents) {
      if (agent.x < GHOST_BAND_METERS) {
        ghosts.push({ ...agent, id: agent.id + GHOST_ID_OFFSET, x: agent.x + length });
      } else if (agent.x > length - GHOST_BAND_METERS) {
        ghosts.push({
          ...agent,
          id: agent.id + 2 * GHOST_ID_OFFSET,
          x: agent.x - length,
        });
      }
    }
    const stepped = step({
      agents: [...agents, ...ghosts],
      dtSeconds: dt,
      meanSpeedMetersPerSecond: meanSpeed,
      walls: wallIndex,
    });

    agents = stepped
      .filter((agent) => agent.id < GHOST_ID_OFFSET)
      .map((agent) => {
        const wrapped = ((agent.x % length) + length) % length;
        // Aim at the same lane so a person does not drift across the corridor.
        return { ...agent, targetY: agent.y, x: wrapped };
      });

    if (stepIndex >= warmupSteps) {
      for (const agent of agents) speedSum += agent.vx;
      samples += agents.length;
    }
  }

  // Mean walking speed along the corridor, m/s.
  return samples > 0 ? speedSum / samples : 0;
}

export function measureCorridorSpeed(
  densityPerSquareMeter: number,
  parameters: Partial<SocialForceParameters>,
  options: CorridorOptions = {},
): number {
  const seed = options.seed ?? 1;
  return runPeriodicCorridor(
    (input) =>
      stepCrowd({
        agents: input.agents,
        dtSeconds: input.dtSeconds,
        exitRadius: () => 0,
        isExitBound: () => false,
        meanSpeedMetersPerSecond: input.meanSpeedMetersPerSecond,
        parameters,
        router: straightAhead,
        seed,
        walls: input.walls,
      }).agents,
    densityPerSquareMeter,
    options,
  );
}
