import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { connectorPitchDegrees, flightFloorId } from "../engine/floorRouting";
import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import { wallLine, type RimeaTestResult } from "./shared";
import { corridorTest } from "./test01Corridor";

/**
 * Test 13's setup (A 4, pp. 42-43, its Fig. 16/17): a 10 m x 10 m room of
 * 100 agents, a stair whose *horizontal projection* is 5 m long and 2 m
 * wide (2 m level approach on each end), and a goal past it. Fig. 17 is
 * captioned "upwards"; the guideline's own text says the downward scenario
 * uses the same geometry with the stair reversed — built here by swapping
 * which of two floors holds the room and which holds the goal, the same
 * technique `stairSpeedScene` already uses for tests 2 and 3.
 *
 * Speed and density are measured over the stair's own horizontal projected
 * area (5 m x 2 m = 10 m^2), not the slope length this project's connectors
 * actually walk (`flightLengthMeters`) — unlike tests 2/3, which measure a
 * single person's speed along the slope itself, because that is what the
 * guideline's own y-axis and x-axis are defined against here.
 *
 * `stairCrowdRiseMeters` is the floor-elevation difference that gives a 30°
 * flight (`connectorPitchDegrees`, this project's own fixed pitch) exactly
 * this horizontal run: rise = horizontal * tan(30 deg).
 *
 * Fig. 16 is a shaded speed-density band read off a real test, "widely
 * spread" in the guideline's own words, with no printed data table.
 * `stairCrowdBand` digitises it off the guideline's own printed gridlines
 * (400 DPI render of p. 42) at density in {0.6, 0.8, 1.0, 1.2, 1.4, 1.5}
 * P/m^2 for each direction — the same practice test 7 already used for
 * Fig. 3's curve, and, like that one, a read of a chart, not a citation of
 * numbers RiMEA prints. `stairCrowdBandAt` interpolates linearly between
 * those points and returns null outside the digitised domain.
 */
export const stairCrowdTest = {
  roomSizeMeters: 10,
  people: 100,
  stairHorizontalMeters: 5,
  stairWidthMeters: 2,
  approachMeters: 2,
  measureIntervalSeconds: 1,
} as const;

const stairCrowdRiseMeters =
  stairCrowdTest.stairHorizontalMeters *
  Math.tan((connectorPitchDegrees * Math.PI) / 180);

/**
 * The two bands' lower edges are cleanly separated at every gridline read
 * (descending always higher). Their upper edges visually converge and, at
 * this table's own far end (1.5 P/m^2), cross by 0.01 m/s — inside the
 * error of reading a printed chart by eye at 400 DPI, not a claim that the
 * climbing band's fastest quartile beats the descending one's there. The
 * lower-edge comparison is what `test13StairCrowd.test.ts` asserts against
 * this table for that reason.
 */
const stairCrowdBand: Record<
  "up" | "down",
  readonly { density: number; high: number; low: number }[]
> = {
  down: [
    { density: 0.6, high: 1.12, low: 0.66 },
    { density: 0.8, high: 1.0, low: 0.6 },
    { density: 1.0, high: 0.89, low: 0.55 },
    { density: 1.2, high: 0.81, low: 0.5 },
    { density: 1.4, high: 0.76, low: 0.48 },
    { density: 1.5, high: 0.73, low: 0.48 },
  ],
  up: [
    { density: 0.6, high: 1.02, low: 0.48 },
    { density: 0.8, high: 0.93, low: 0.46 },
    { density: 1.0, high: 0.86, low: 0.46 },
    { density: 1.2, high: 0.8, low: 0.46 },
    { density: 1.4, high: 0.76, low: 0.46 },
    { density: 1.5, high: 0.74, low: 0.46 },
  ],
};

export function stairCrowdBandAt(
  direction: "up" | "down",
  density: number,
): { high: number; low: number } | null {
  const points = stairCrowdBand[direction];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    if (density >= a.density && density <= b.density) {
      const t = (density - a.density) / (b.density - a.density);
      return { high: a.high + t * (b.high - a.high), low: a.low + t * (b.low - a.low) };
    }
  }

  return null; // outside every gridline segment this project digitised
}

function stairCrowdScene(direction: "up" | "down", seed: number): CrowdSimScene {
  const t = stairCrowdTest;
  const roomFloor = direction === "up" ? "lower" : "upper";
  const goalFloor = direction === "up" ? "upper" : "lower";
  const half = t.stairWidthMeters / 2;
  const corridorY = [t.roomSizeMeters / 2 - half, t.roomSizeMeters / 2 + half] as const;
  const roomEastX = t.roomSizeMeters;
  const stairMouthX = roomEastX + t.approachMeters;
  const goalMouthX = stairMouthX + t.approachMeters;
  // A world's coordinates never go below (0,0) (`clampPointToWorld`), so the
  // goal sink sits a metre past the departure corridor's own open end,
  // rather than exactly on it — the same margin every other test in this
  // file gives a sink, for the same reason (a first version elsewhere
  // stranded agents at the door by skipping it).
  const goalX = goalMouthX + 1;

  return parseScene({
    schemaVersion: "1.0.0",
    id: `rimea-test-13-${direction}-${seed}`,
    name: `RiMEA test 13: stair crowd, ${direction}`,
    seed,
    speedMetersPerSecond: corridorTest.speedMetersPerSecond,
    world: { width: goalX + 3, height: t.roomSizeMeters },
    floors: [
      { id: "lower", level: 0, elevationMeters: 0 },
      { id: "upper", level: 1, elevationMeters: stairCrowdRiseMeters },
    ],
    walls: [
      wallLine("room-north", roomFloor, 0, 0, roomEastX, 0),
      wallLine(
        "room-south",
        roomFloor,
        0,
        t.roomSizeMeters,
        roomEastX,
        t.roomSizeMeters,
      ),
      wallLine("room-west", roomFloor, 0, 0, 0, t.roomSizeMeters),
      wallLine("room-east-1", roomFloor, roomEastX, 0, roomEastX, corridorY[0]),
      wallLine(
        "room-east-2",
        roomFloor,
        roomEastX,
        corridorY[1],
        roomEastX,
        t.roomSizeMeters,
      ),
      wallLine(
        "approach-north",
        roomFloor,
        roomEastX,
        corridorY[0],
        stairMouthX,
        corridorY[0],
      ),
      wallLine(
        "approach-south",
        roomFloor,
        roomEastX,
        corridorY[1],
        stairMouthX,
        corridorY[1],
      ),
      wallLine(
        "departure-north",
        goalFloor,
        stairMouthX,
        corridorY[0],
        goalMouthX,
        corridorY[0],
      ),
      wallLine(
        "departure-south",
        goalFloor,
        stairMouthX,
        corridorY[1],
        goalMouthX,
        corridorY[1],
      ),
    ],
    connectors: [
      {
        id: "stair",
        kind: "stair",
        from: {
          floorId: roomFloor,
          point: { x: stairMouthX, y: t.roomSizeMeters / 2 },
        },
        to: { floorId: goalFloor, point: { x: stairMouthX, y: t.roomSizeMeters / 2 } },
        width: t.stairWidthMeters,
        bidirectional: false,
      },
    ],
    entrances: [
      {
        id: "occupants",
        floorId: roomFloor,
        kind: "source",
        position: { x: roomEastX / 2, y: t.roomSizeMeters / 2 },
        width: roomEastX,
        arrivalProfile: { intervalMinutes: 1, ratesPerMinute: [t.people * 1.5] },
        arrivalRatePerMinute: 0,
        groupShare: 0,
      },
      {
        id: "goal",
        floorId: goalFloor,
        kind: "sink",
        position: { x: goalX, y: t.roomSizeMeters / 2 },
        width: t.stairWidthMeters,
      },
    ],
  });
}

/**
 * Density (people per m^2 of the stair's horizontal projection) and mean
 * walking speed, sampled every `measureIntervalSeconds` while anyone is on
 * the stair's own flight lane.
 */
function measureStairCrowd(
  direction: "up" | "down",
  seed: number,
): readonly { density: number; speed: number }[] {
  const t = stairCrowdTest;
  const engine = createSimulationEngineFromScene(stairCrowdScene(direction, seed), {
    maxAgents: t.people,
  });
  engine.start();

  const laneId = flightFloorId("stair");
  const areaSquareMeters = t.stairHorizontalMeters * t.stairWidthMeters;
  const stepsPerSample = Math.round(t.measureIntervalSeconds * 60);
  const samples: { density: number; speed: number }[] = [];

  for (let step = 0; step < 600 * 60; step++) {
    engine.step(1 / 60);
    const snapshot = engine.snapshot();

    if (step % stepsPerSample === 0) {
      const onStair = snapshot.agents.filter((agent) => agent.floorId === laneId);
      if (onStair.length > 0) {
        samples.push({
          density: onStair.length / areaSquareMeters,
          speed:
            onStair.reduce(
              (sum, agent) =>
                sum + Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy),
              0,
            ) / onStair.length,
        });
      }
    }

    if (snapshot.exitedCount >= t.people) {
      break;
    }
  }

  return samples;
}

/**
 * Test 13: does speed-vs-density on the stair fall inside Fig. 16's own
 * digitised band, and is the descending run faster than the climbing one?
 *
 * Judged on a *majority* of in-domain samples falling inside the band, not
 * all of them — the guideline's own text calls its reference data "widely
 * spread", so a strict every-sample bound would be truer to a cleaner
 * dataset than the one RiMEA actually published. Direction is judged more
 * strictly: every density bin the two runs share should show the
 * descending mean faster, since that ordering is the guideline's own
 * explicit, unqualified claim ("this should be reproduced by the
 * simulation"), not a spread it is describing.
 */
export function runStairCrowdTest(): RimeaTestResult {
  const up = measureStairCrowd("up", 13);
  const down = measureStairCrowd("down", 14);

  function bandShare(
    direction: "up" | "down",
    samples: readonly { density: number; speed: number }[],
  ) {
    let inDomain = 0;
    let inside = 0;
    for (const sample of samples) {
      const band = stairCrowdBandAt(direction, sample.density);
      if (!band) continue;
      inDomain++;
      if (sample.speed >= band.low && sample.speed <= band.high) inside++;
    }
    return inDomain === 0 ? null : { inDomain, inside };
  }

  // 0.2 P/m², Fig. 16's own gridline spacing (0.6, 0.8, 1.0, ...) — coarse
  // enough that a bin actually collects more than a sample or two from a
  // density trajectory that is sweeping through, not sitting still at one
  // value.
  const densityBinWidth = 0.2;

  function meanSpeedByBin(samples: readonly { density: number; speed: number }[]) {
    const bins = new Map<number, { count: number; sum: number }>();
    for (const sample of samples) {
      const bin = Math.round(sample.density / densityBinWidth) * densityBinWidth;
      const entry = bins.get(bin) ?? { count: 0, sum: 0 };
      entry.count += 1;
      entry.sum += sample.speed;
      bins.set(bin, entry);
    }
    return bins;
  }

  const upShare = bandShare("up", up);
  const downShare = bandShare("down", down);
  const upBins = meanSpeedByBin(up);
  const downBins = meanSpeedByBin(down);
  // A bin either run visited only once or twice (typically the lowest —
  // one or two pioneers on the stair before the rest of the crowd catches
  // up) is a mean of noise, not of the flow: this project's own 19% speed
  // spread alone can flip a 1-sample "mean" either way. Comparing means
  // needs more than that to say anything; `minSamplesPerBin` is this test's
  // own choice for "enough", not a value RiMEA gives.
  const minSamplesPerBin = 3;
  let comparedBins = 0;
  let downFasterBins = 0;
  for (const [bin, upEntry] of upBins) {
    const downEntry = downBins.get(bin);
    if (!downEntry) continue;
    if (upEntry.count < minSamplesPerBin || downEntry.count < minSamplesPerBin)
      continue;
    comparedBins++;
    if (downEntry.sum / downEntry.count > upEntry.sum / upEntry.count) {
      downFasterBins++;
    }
  }

  const bothMeasured = up.length > 0 && down.length > 0;
  const bandOk =
    upShare !== null &&
    downShare !== null &&
    upShare.inside / upShare.inDomain >= 0.5 &&
    downShare.inside / downShare.inDomain >= 0.5;
  const directionOk = comparedBins > 0 && downFasterBins === comparedBins;

  return {
    number: 13,
    title: "Fundamental diagram on stairs",
    status: bothMeasured && bandOk && directionOk ? "pass" : "fail",
    measured: bothMeasured
      ? `up: ${up.length} samples${upShare ? `, ${upShare.inside}/${upShare.inDomain} inside Fig. 16's band` : " (none in its density domain)"}; down: ${down.length} samples${downShare ? `, ${downShare.inside}/${downShare.inDomain} inside band` : " (none in its density domain)"}; descending faster at ${downFasterBins}/${comparedBins} compared density bins`
      : `up ${up.length} samples, down ${down.length} samples`,
    criterion: `RiMEA 4.1.1 A 4 test 13 (p. 42-43, its Fig. 16/17): ${stairCrowdTest.people} agents in a ${stairCrowdTest.roomSizeMeters} m x ${stairCrowdTest.roomSizeMeters} m room walk through a stair whose horizontal projection is ${stairCrowdTest.stairHorizontalMeters} m x ${stairCrowdTest.stairWidthMeters} m to a goal, once climbing and once descending. Density and speed sampled every ${stairCrowdTest.measureIntervalSeconds} s over the stair's own horizontal projected area. Judged against Fig. 16's own shaded band, digitised off the guideline's printed chart (it prints no data table): a majority of in-domain samples inside the band in each direction, and the descending run faster than the climbing one at every compared density bin both runs sampled at least ${minSamplesPerBin} times — a self-chosen floor against comparing two 1-sample means, not a value RiMEA gives.`,
  };
}
