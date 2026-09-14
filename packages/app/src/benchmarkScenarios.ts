// HONESTY NOTE (see docs/CLAIMS_LEDGER.md and ./pedestrianFundamentalDiagram.ts)
//
// These scenarios are named after RiMEA test cases but they are NOT the RiMEA
// geometry, and every expectation below is `source: "self-authored"` -- the
// ranges bracket what this engine produces, so they are regression guards, not
// evidence of correctness.
//
// 2026-09-14: re-baselined for the social-force movement model
// (`crowdMovement.ts`). The ranges had been fitted to the old kinematic model,
// which walked everyone at exactly the scene speed; the corridor range
// (1.25-1.38 m/s around a 1.34 m/s engine) could not be missed. Walkers now
// accelerate from rest, have their own free speeds and push each other, so
// mean speeds fall below the scene speed. The one physical bound kept on every
// speed range is its maximum: the scene's mean free speed, which a crowd with
// no outside push cannot average above. Old -> new values are in the ledger.
//
// "counterflow" names each source's exit (ADR-0008). Before that, every walker
// left by the nearest exit, which for both sources was the one 4 m beside it,
// so the scenario had no counterflow in it (206 of 211 walkers exited after a
// 4 m walk). Now both flows cross the whole corridor.
import { parseScene } from "@crowdsim/scene-schema";
import type { BenchmarkScenario } from "./benchmarkTypes";

const sharedSimulation = {
  fixedDtSeconds: 1 / 20,
  maxAgents: 600,
  speedMetersPerSecond: 1.34,
};

export const rimeaCoreScenarios: readonly BenchmarkScenario[] = [
  {
    description: "Single-direction corridor flow with one source and one sink.",
    durationSeconds: 90,
    expectations: [
      { metric: "spawnedCount", range: { min: 80, max: 240 }, source: "self-authored" },
      { metric: "exitedCount", range: { min: 40, max: 220 }, source: "self-authored" },
      {
        metric: "meanSpeedMetersPerSecond",
        range: { min: 1.15, max: 1.34 },
        source: "self-authored",
      },
      {
        metric: "throughputPerMinute",
        range: { min: 25, max: 150 },
        source: "self-authored",
      },
    ],
    id: "rimea-straight-corridor",
    name: "RiMEA straight corridor",
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "rimea-straight-corridor",
      name: "RiMEA straight corridor",
      seed: 5101,
      world: { width: 64, height: 10 },
      entrances: [
        {
          id: "west-source",
          kind: "source",
          position: { x: 2, y: 5 },
          width: 4,
          arrivalRatePerMinute: 90,
        },
        {
          id: "east-sink",
          kind: "sink",
          position: { x: 62, y: 5 },
          width: 4,
        },
      ],
      areas: [floorArea("floor", 64, 10)],
    }),
    simulation: sharedSimulation,
    tags: ["M5", "RiMEA", "corridor"],
  },
  {
    description:
      "Higher demand corridor used as a bottleneck proxy until wall-aware routing is benchmarked.",
    durationSeconds: 90,
    expectations: [
      {
        metric: "spawnedCount",
        range: { min: 140, max: 340 },
        source: "self-authored",
      },
      { metric: "exitedCount", range: { min: 70, max: 300 }, source: "self-authored" },
      {
        metric: "densityPeak",
        range: { min: 0.01, max: 2.5 },
        source: "self-authored",
      },
      {
        metric: "throughputPerMinute",
        range: { min: 45, max: 220 },
        source: "self-authored",
      },
    ],
    id: "rimea-bottleneck",
    name: "RiMEA bottleneck",
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "rimea-bottleneck",
      name: "RiMEA bottleneck",
      seed: 5102,
      world: { width: 50, height: 12 },
      walls: [
        {
          id: "north-neck",
          geometry: {
            type: "polyline",
            points: [
              { x: 24, y: 0 },
              { x: 24, y: 4 },
            ],
          },
        },
        {
          id: "south-neck",
          geometry: {
            type: "polyline",
            points: [
              { x: 24, y: 8 },
              { x: 24, y: 12 },
            ],
          },
        },
      ],
      entrances: [
        {
          id: "west-source",
          kind: "source",
          position: { x: 2, y: 6 },
          width: 8,
          arrivalRatePerMinute: 150,
        },
        {
          id: "east-sink",
          kind: "sink",
          position: { x: 48, y: 6 },
          width: 2,
        },
      ],
      areas: [floorArea("floor", 50, 12)],
    }),
    simulation: {
      ...sharedSimulation,
      speedMetersPerSecond: 1.22,
    },
    tags: ["M5", "RiMEA", "bottleneck"],
  },
  {
    description:
      "L-shaped route with a corner geometry fixture for turning benchmarks.",
    durationSeconds: 100,
    expectations: [
      { metric: "spawnedCount", range: { min: 80, max: 260 }, source: "self-authored" },
      { metric: "exitedCount", range: { min: 35, max: 230 }, source: "self-authored" },
      {
        metric: "meanSpeedMetersPerSecond",
        range: { min: 0.9, max: 1.18 },
        source: "self-authored",
      },
    ],
    id: "rimea-corner",
    name: "RiMEA corner",
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "rimea-corner",
      name: "RiMEA corner",
      seed: 5103,
      world: { width: 44, height: 44 },
      walls: [
        {
          id: "inner-corner",
          geometry: {
            type: "polyline",
            points: [
              { x: 18, y: 0 },
              { x: 18, y: 22 },
              { x: 34, y: 22 },
            ],
          },
        },
      ],
      entrances: [
        {
          id: "south-source",
          kind: "source",
          position: { x: 8, y: 40 },
          width: 5,
          arrivalRatePerMinute: 85,
        },
        {
          id: "east-sink",
          kind: "sink",
          position: { x: 40, y: 8 },
          width: 5,
        },
      ],
      areas: [floorArea("floor", 44, 44)],
    }),
    simulation: {
      ...sharedSimulation,
      speedMetersPerSecond: 1.18,
    },
    tags: ["M5", "RiMEA", "corner"],
  },
  {
    description:
      "Two opposing flows with balanced rates, each sent to the exit at the far end of the corridor.",
    durationSeconds: 90,
    expectations: [
      {
        metric: "spawnedCount",
        range: { min: 120, max: 360 },
        source: "self-authored",
      },
      { metric: "exitedCount", range: { min: 60, max: 320 }, source: "self-authored" },
      {
        metric: "meanSpeedMetersPerSecond",
        range: { min: 0.95, max: 1.16 },
        source: "self-authored",
      },
      {
        metric: "densityPeak",
        range: { min: 0.01, max: 1.6 },
        source: "self-authored",
      },
    ],
    id: "rimea-counterflow",
    name: "RiMEA counterflow",
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "rimea-counterflow",
      name: "RiMEA counterflow",
      seed: 5104,
      world: { width: 56, height: 12 },
      entrances: [
        {
          id: "west-source",
          kind: "source",
          position: { x: 2, y: 4 },
          width: 4,
          arrivalRatePerMinute: 75,
          exitIds: ["east-sink"],
        },
        {
          id: "east-source",
          kind: "source",
          position: { x: 54, y: 8 },
          width: 4,
          arrivalRatePerMinute: 75,
          exitIds: ["west-sink"],
        },
        {
          id: "west-sink",
          kind: "sink",
          position: { x: 2, y: 8 },
          width: 4,
        },
        {
          id: "east-sink",
          kind: "sink",
          position: { x: 54, y: 4 },
          width: 4,
        },
      ],
      areas: [floorArea("floor", 56, 12)],
    }),
    simulation: {
      ...sharedSimulation,
      speedMetersPerSecond: 1.16,
    },
    tags: ["M5", "RiMEA", "counterflow"],
  },
];

function floorArea(id: string, width: number, height: number) {
  return {
    id,
    geometry: {
      type: "polygon" as const,
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
    },
  };
}
