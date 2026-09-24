import { parseScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import {
  buildRoadRuntime,
  buildRoadTurnOptions,
  signalIsRed,
  stepVehicles,
  worldPositionAtProgress,
  type VehicleAgent,
} from "./vehicleSimulation";

function scene(overrides: Record<string, unknown> = {}) {
  return parseScene({
    schemaVersion: "1.0.0" as const,
    id: "vehicle-test",
    name: "Vehicle test",
    world: { width: 200, height: 200 },
    roads: [
      {
        id: "main-street",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
        direction: "twoWay",
        vehicleAccessible: true,
        vehicleArrivalRatePerMinute: 0,
        vehicleSpeedLimitMetersPerSecond: 10,
      },
    ],
    ...overrides,
  });
}

function road(overrides: Record<string, unknown> = {}) {
  const built = scene({
    roads: [
      {
        id: "main-street",
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
        direction: "twoWay",
        vehicleAccessible: true,
        vehicleArrivalRatePerMinute: 0,
        vehicleSpeedLimitMetersPerSecond: 10,
        ...overrides,
      },
    ],
  });
  return built.roads[0];
}

const alwaysZero = () => 0;
const alwaysOne = () => 1;

/** A road long enough that a vehicle run for many simulated seconds at the
 * default 10 m/s speed limit can't reach the far end and despawn — the
 * default 100 m fixture road exists to make short, hand-checkable arclength
 * assertions easy, not to survive minutes of simulated driving. */
const longRoadGeometry = {
  points: [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
  ],
  type: "polyline" as const,
};

function car(overrides: Partial<VehicleAgent> = {}): VehicleAgent {
  return {
    dwellRemainingSeconds: 0,
    dwelledStopIds: [],
    headingRadians: 0,
    id: "v1",
    kind: "car",
    laneDirection: "forward",
    progressMeters: 0,
    roadId: "main-street",
    speedMetersPerSecond: 0,
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe("buildRoadRuntime", () => {
  it("computes cumulative arclength and total length for a multi-segment road", () => {
    const built = scene({
      roads: [
        {
          id: "bent-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 30, y: 0 },
              { x: 30, y: 40 },
            ],
          },
        },
      ],
    });
    const runtime = buildRoadRuntime(built.roads[0], [], []);
    expect(runtime.cumulative).toEqual([0, 30, 70]);
    expect(runtime.totalLengthMeters).toBe(70);
  });

  it("resolves directions from the road's own direction field", () => {
    expect(
      buildRoadRuntime(road({ direction: "oneWayForward" }), [], []).directions,
    ).toEqual(["forward"]);
    expect(
      buildRoadRuntime(road({ direction: "oneWayBackward" }), [], []).directions,
    ).toEqual(["backward"]);
    expect(buildRoadRuntime(road({ direction: "twoWay" }), [], []).directions).toEqual([
      "forward",
      "backward",
    ]);
  });

  it("only attaches crosswalks and stops that belong to this road, and projects their position onto it", () => {
    const built = scene({
      crosswalks: [
        { id: "cw-1", roadId: "main-street", position: { x: 40, y: 5 } },
        { id: "cw-other-road", roadId: "side-street", position: { x: 10, y: 0 } },
      ],
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          vehicleAccessible: true,
        },
        {
          id: "side-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 20 },
              { x: 100, y: 20 },
            ],
          },
        },
      ],
      transitStops: [
        { id: "stop-1", roadId: "main-street", kind: "bus", position: { x: 60, y: 2 } },
      ],
    });
    const runtime = buildRoadRuntime(
      built.roads[0],
      built.crosswalks,
      built.transitStops,
    );
    expect(runtime.crosswalks).toEqual([
      { forwardArclengthMeters: 40, id: "cw-1", widthMeters: 3 },
    ]);
    expect(runtime.stops).toEqual([
      { alightingPerArrival: 24, forwardArclengthMeters: 60, id: "stop-1" },
    ]);
  });
});

describe("worldPositionAtProgress", () => {
  it("moves forward vehicles from the road's start toward its end, facing along it", () => {
    const runtime = buildRoadRuntime(road(), [], []);
    expect(worldPositionAtProgress(runtime, "forward", 0)).toEqual({
      x: 0,
      y: 0,
      headingRadians: 0,
    });
    expect(worldPositionAtProgress(runtime, "forward", 100)).toEqual({
      x: 100,
      y: 0,
      headingRadians: 0,
    });
  });

  it("moves backward vehicles from the road's end toward its start, facing the other way", () => {
    const runtime = buildRoadRuntime(road(), [], []);
    expect(worldPositionAtProgress(runtime, "backward", 0)).toEqual({
      x: 100,
      y: 0,
      headingRadians: Math.PI,
    });
    expect(worldPositionAtProgress(runtime, "backward", 100)).toEqual({
      x: 0,
      y: 0,
      headingRadians: Math.PI,
    });
  });

  it("faces the segment's own direction on a bent road, not the road's overall start-to-end line", () => {
    const bent = buildRoadRuntime(
      road({
        geometry: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 50 },
          ],
        },
      }),
      [],
      [],
    );

    // Still on the first leg, along +x.
    expect(worldPositionAtProgress(bent, "forward", 25).headingRadians).toBeCloseTo(0);
    // Past the corner, on the second leg, along +y — atan2(dy, dx) for
    // (0, 50), a quarter turn from the first leg's heading.
    expect(worldPositionAtProgress(bent, "forward", 75).headingRadians).toBeCloseTo(
      Math.PI / 2,
    );
  });
});

describe("stepVehicles: free-flow car-following", () => {
  it("accelerates a lone vehicle toward the road's speed limit", () => {
    const runtime = buildRoadRuntime(
      road({ geometry: longRoadGeometry, vehicleSpeedLimitMetersPerSecond: 10 }),
      [],
      [],
    );
    let vehicles = [car()];
    for (let i = 0; i < 600; i++) {
      vehicles = stepVehicles({
        dtSeconds: 1 / 10,
        elapsedSeconds: 0,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
    }
    expect(vehicles[0].speedMetersPerSecond).toBeCloseTo(10, 1);
  });

  it("never lets a trailing vehicle overtake (pass through) the one ahead of it", () => {
    const runtime = buildRoadRuntime(
      road({ geometry: longRoadGeometry, vehicleSpeedLimitMetersPerSecond: 10 }),
      [],
      [],
    );
    let vehicles = [
      car({ id: "leader", progressMeters: 20, speedMetersPerSecond: 2 }),
      car({ id: "follower", progressMeters: 0, speedMetersPerSecond: 10 }),
    ];
    for (let i = 0; i < 2000; i++) {
      vehicles = stepVehicles({
        dtSeconds: 1 / 20,
        elapsedSeconds: 0,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
    }
    const leader = vehicles.find((v) => v.id === "leader")!;
    const follower = vehicles.find((v) => v.id === "follower")!;
    expect(follower.progressMeters).toBeLessThan(leader.progressMeters);
    // Settles into a following gap rather than crawling arbitrarily close.
    expect(leader.progressMeters - follower.progressMeters).toBeGreaterThan(3);
  });
});

describe("stepVehicles: crosswalk yielding", () => {
  it("stops a vehicle before a crosswalk a pedestrian is standing on, and lets it go once they clear", () => {
    const built = scene({
      crosswalks: [{ id: "cw-1", roadId: "main-street", position: { x: 300, y: 0 } }],
      roads: [
        {
          direction: "twoWay",
          geometry: longRoadGeometry,
          id: "main-street",
          vehicleAccessible: true,
          vehicleArrivalRatePerMinute: 0,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
      ],
    });
    const runtime = buildRoadRuntime(built.roads[0], built.crosswalks, []);
    let vehicles = [car({ progressMeters: 250, speedMetersPerSecond: 8 })];
    const occupiedCrosswalk = [{ x: 300, y: 0 }];

    for (let i = 0; i < 400; i++) {
      vehicles = stepVehicles({
        dtSeconds: 1 / 20,
        elapsedSeconds: 0,
        pedestrians: occupiedCrosswalk,
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
    }
    // Stopped at (not past) the crosswalk, well short of the vehicle length
    // reaching its centre.
    expect(vehicles[0].progressMeters).toBeLessThan(300);
    expect(vehicles[0].speedMetersPerSecond).toBeCloseTo(0, 1);

    for (let i = 0; i < 400; i++) {
      vehicles = stepVehicles({
        dtSeconds: 1 / 20,
        elapsedSeconds: 0,
        pedestrians: [], // pedestrian has crossed
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
    }
    expect(vehicles[0].progressMeters).toBeGreaterThan(300);
  });
});

describe("stepVehicles: bus dwell", () => {
  it("decelerates toward a stop, dwells for a duration derived from alightingPerArrival, then resumes", () => {
    const built = scene({
      roads: [
        {
          direction: "twoWay",
          geometry: longRoadGeometry,
          id: "main-street",
          vehicleAccessible: true,
          vehicleArrivalRatePerMinute: 0,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
      ],
      transitStops: [
        {
          id: "stop-1",
          roadId: "main-street",
          kind: "bus",
          position: { x: 300, y: 0 },
          alightingPerArrival: 16,
        },
      ],
    });
    const runtime = buildRoadRuntime(built.roads[0], [], built.transitStops);
    let vehicles: VehicleAgent[] = [car({ id: "bus-1", kind: "bus" })];
    const dtSeconds = 1 / 20;

    let arrivedAtProgress: number | undefined;
    for (let i = 0; i < 4000 && arrivedAtProgress === undefined; i++) {
      vehicles = stepVehicles({
        dtSeconds,
        elapsedSeconds: 0,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
      if (vehicles[0].dwellRemainingSeconds > 0) {
        arrivedAtProgress = vehicles[0].progressMeters;
      }
    }

    expect(arrivedAtProgress).toBeDefined();
    // Arrived at (not blown past) the stop, and didn't need to travel the
    // full road to get there.
    expect(arrivedAtProgress!).toBeGreaterThan(290);
    expect(arrivedAtProgress!).toBeLessThan(305);
    expect(vehicles[0].dwellRemainingSeconds).toBeCloseTo(8 + 16 / 1, 5); // busDoorSeconds + alighting/rate
    expect(vehicles[0].speedMetersPerSecond).toBe(0);

    const progressWhileDwelling = arrivedAtProgress!;
    let stillDwelling = true;
    let steps = 0;
    while (stillDwelling && steps < 4000) {
      vehicles = stepVehicles({
        dtSeconds,
        elapsedSeconds: 0,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
      stillDwelling = vehicles[0].dwellRemainingSeconds > 0;
      if (stillDwelling) {
        expect(vehicles[0].progressMeters).toBe(progressWhileDwelling);
      }
      steps++;
    }

    expect(vehicles[0].dwellRemainingSeconds).toBe(0);
    // Resumed moving past where it dwelled.
    for (let i = 0; i < 200; i++) {
      vehicles = stepVehicles({
        dtSeconds,
        elapsedSeconds: 0,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
    }
    expect(vehicles[0].progressMeters).toBeGreaterThan(progressWhileDwelling);
  });

  it("does not re-trigger a dwell at a stop the bus has already served", () => {
    const built = scene({
      transitStops: [
        { id: "stop-1", roadId: "main-street", kind: "bus", position: { x: 5, y: 0 } },
      ],
    });
    const runtime = buildRoadRuntime(built.roads[0], [], built.transitStops);
    let vehicles: VehicleAgent[] = [
      car({
        id: "bus-1",
        dwelledStopIds: ["stop-1"],
        kind: "bus",
        progressMeters: 4,
        speedMetersPerSecond: 3,
      }),
    ];

    vehicles = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysOne,
      roads: [runtime],
      vehicles,
    });
    expect(vehicles[0].dwellRemainingSeconds).toBe(0);
  });
});

describe("stepVehicles: despawn", () => {
  it("removes a vehicle once it reaches its road's far end, instead of leaving it clamped there forever", () => {
    const runtime = buildRoadRuntime(
      road({ vehicleSpeedLimitMetersPerSecond: 10 }),
      [],
      [],
    );
    let vehicles = [car({ progressMeters: 99.7, speedMetersPerSecond: 10 })];

    vehicles = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysOne,
      roads: [runtime],
      vehicles,
    });

    expect(vehicles).toHaveLength(0);
  });

  it("stops constraining a following vehicle the tick after its leader despawns", () => {
    const runtime = buildRoadRuntime(
      road({ direction: "oneWayForward", vehicleSpeedLimitMetersPerSecond: 10 }),
      [],
      [],
    );
    // "ahead" is one tick from the road's end; "behind" is close enough
    // behind it (a real 5 m gap, well inside IDM's ~17 m desired gap at
    // this speed) to be genuinely braking because of it, not coasting.
    const withLeader = [
      car({ id: "ahead", progressMeters: 99.5, speedMetersPerSecond: 10 }),
      car({ id: "behind", progressMeters: 90, speedMetersPerSecond: 10 }),
    ];

    const afterTick1 = stepVehicles({
      dtSeconds: 1 / 10,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysOne,
      roads: [runtime],
      vehicles: withLeader,
    });
    // "ahead" reached the road's end this tick and is gone.
    expect(afterTick1.find((v) => v.id === "ahead")).toBeUndefined();
    const behindAfterTick1 = afterTick1.find((v) => v.id === "behind")!;
    // Genuinely braked this tick because of the close leader that was there.
    expect(behindAfterTick1.speedMetersPerSecond).toBeLessThan(10);

    // If the bug this guards against were still present -- "ahead" left in
    // the array forever, clamped at the road's end instead of removed --
    // "behind" would keep braking toward that phantom leader on every
    // following tick. With the fix, "ahead" is already gone, so this next
    // tick is free-flow: behind should be accelerating again, not still
    // decelerating toward where "ahead" used to be.
    const afterTick2 = stepVehicles({
      dtSeconds: 1 / 10,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysOne,
      roads: [runtime],
      vehicles: afterTick1,
    });
    const behindAfterTick2 = afterTick2.find((v) => v.id === "behind")!;
    expect(behindAfterTick2.speedMetersPerSecond).toBeGreaterThan(
      behindAfterTick1.speedMetersPerSecond,
    );
  });
});

describe("stepVehicles: spawning", () => {
  it("spawns a vehicle at the road's entry when the random draw clears the arrival probability", () => {
    const runtime = buildRoadRuntime(
      road({ direction: "oneWayForward", vehicleArrivalRatePerMinute: 60 }),
      [],
      [],
    );
    const spawned = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysZero, // 0 < probability always spawns
      roads: [runtime],
      vehicles: [],
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0].progressMeters).toBe(0);
    expect(spawned[0].roadId).toBe("main-street");
  });

  it("never spawns when the arrival rate is zero", () => {
    const runtime = buildRoadRuntime(road({ vehicleArrivalRatePerMinute: 0 }), [], []);
    const spawned = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysZero,
      roads: [runtime],
      vehicles: [],
    });
    expect(spawned).toHaveLength(0);
  });

  it("does not spawn on top of a vehicle still near the entry", () => {
    const runtime = buildRoadRuntime(
      road({ direction: "oneWayForward", vehicleArrivalRatePerMinute: 60 }),
      [],
      [],
    );
    const result = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysZero,
      roads: [runtime],
      vehicles: [car({ progressMeters: 1 })],
    });
    expect(result).toHaveLength(1); // only the pre-existing vehicle, stepped
  });
});

describe("buildRoadTurnOptions (ADR-0023)", () => {
  it("connects two roads whose endpoints meet within the snap tolerance", () => {
    const built = scene({
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          direction: "twoWay",
          vehicleAccessible: true,
        },
        {
          id: "cross-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
          },
          direction: "twoWay",
          vehicleAccessible: true,
        },
      ],
    });
    const runtimes = built.roads.map((r) => buildRoadRuntime(r, [], []));
    const options = buildRoadTurnOptions(runtimes);
    expect(options.get("main-street:end")).toEqual([
      { end: "start", roadId: "cross-street" },
    ]);
    expect(options.get("cross-street:start")).toEqual([
      { end: "end", roadId: "main-street" },
    ]);
  });

  it("does not connect roads whose endpoints are far apart", () => {
    const built = scene({
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          direction: "twoWay",
          vehicleAccessible: true,
        },
        {
          id: "far-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 500, y: 500 },
              { x: 600, y: 500 },
            ],
          },
          direction: "twoWay",
          vehicleAccessible: true,
        },
      ],
    });
    const runtimes = built.roads.map((r) => buildRoadRuntime(r, [], []));
    const options = buildRoadTurnOptions(runtimes);
    expect(options.get("main-street:end")).toEqual([]);
  });
});

describe("stepVehicles: turning at a junction (ADR-0023)", () => {
  function junctionRoads(
    crossDirection: "oneWayForward" | "oneWayBackward" | "twoWay",
  ) {
    const built = scene({
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          direction: "oneWayForward",
          vehicleAccessible: true,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
        {
          id: "cross-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
          },
          direction: crossDirection,
          vehicleAccessible: true,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
      ],
    });
    return built.roads.map((r) => buildRoadRuntime(r, [], []));
  }

  it("turns a vehicle onto a connected road instead of despawning it", () => {
    const roads = junctionRoads("twoWay");
    // One step from the far end: covers the remaining distance and arrives
    // exactly at the junction this same tick.
    let vehicles: VehicleAgent[] = [
      car({ progressMeters: 99, speedMetersPerSecond: 10 }),
    ];
    vehicles = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysZero,
      roads,
      vehicles,
    });
    expect(vehicles).toHaveLength(1); // did not despawn
    expect(vehicles[0].roadId).toBe("cross-street");
    expect(vehicles[0].laneDirection).toBe("forward");
    expect(vehicles[0].progressMeters).toBe(0);
    expect(vehicles[0].x).toBeCloseTo(100);
    expect(vehicles[0].y).toBeCloseTo(0);
  });

  it("despawns at a dead end when no connected road permits entry (one-way against it)", () => {
    // cross-street is oneWayBackward: entering it from its own start
    // ("forward") is not a direction it permits, so main-street's traffic
    // has nowhere to turn even though the roads geometrically meet.
    const roads = junctionRoads("oneWayBackward");
    let vehicles: VehicleAgent[] = [
      car({ progressMeters: 99, speedMetersPerSecond: 10 }),
    ];
    vehicles = stepVehicles({
      dtSeconds: 1,
      elapsedSeconds: 0,
      pedestrians: [],
      random: alwaysZero,
      roads,
      vehicles,
    });
    expect(vehicles).toHaveLength(0);
  });

  it("picks among multiple connected roads using the deterministic random draw, not always the first", () => {
    const built = scene({
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          direction: "oneWayForward",
          vehicleAccessible: true,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
        {
          id: "branch-a",
          geometry: {
            type: "polyline",
            points: [
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
          },
          direction: "twoWay",
          vehicleAccessible: true,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
        {
          id: "branch-b",
          geometry: {
            type: "polyline",
            points: [
              { x: 100, y: 0 },
              { x: 100, y: -100 },
            ],
          },
          direction: "twoWay",
          vehicleAccessible: true,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
      ],
    });
    const roads = built.roads.map((r) => buildRoadRuntime(r, [], []));
    const withDraw = (draw: number) =>
      stepVehicles({
        dtSeconds: 1,
        elapsedSeconds: 0,
        pedestrians: [],
        random: () => draw,
        roads,
        vehicles: [car({ progressMeters: 99, speedMetersPerSecond: 10 })],
      })[0].roadId;
    // Two candidates (branch-a, branch-b) in the order buildRoadTurnOptions
    // enumerates roads: a low draw picks the first, a draw just under 1
    // picks the last — proving the choice is real, not hardcoded to always
    // the same branch.
    expect(withDraw(0)).toBe("branch-a");
    expect(withDraw(0.99)).toBe("branch-b");
  });
});

describe("signalIsRed (ADR-0023)", () => {
  const signal = {
    forwardArclengthMeters: 0,
    greenSeconds: 20,
    id: "signal-1",
    offsetSeconds: 0,
    redSeconds: 10,
  };

  it("is green for the first greenSeconds of each cycle and red after", () => {
    expect(signalIsRed(signal, 0)).toBe(false);
    expect(signalIsRed(signal, 19.9)).toBe(false);
    expect(signalIsRed(signal, 20)).toBe(true);
    expect(signalIsRed(signal, 29.9)).toBe(true);
  });

  it("wraps to green again at the start of the next cycle", () => {
    expect(signalIsRed(signal, 30)).toBe(false); // cycle length 30
    expect(signalIsRed(signal, 50)).toBe(true);
  });

  it("staggers via offsetSeconds", () => {
    const offsetSignal = { ...signal, offsetSeconds: 20 };
    // Same instant a same-timed, unoffset signal is green, this one is red.
    expect(signalIsRed(signal, 0)).toBe(false);
    expect(signalIsRed(offsetSignal, 0)).toBe(true);
  });
});

describe("stepVehicles: traffic signals (ADR-0023)", () => {
  function signalledRoad() {
    const built = scene({
      roads: [
        {
          id: "main-street",
          geometry: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          direction: "oneWayForward",
          vehicleAccessible: true,
          vehicleSpeedLimitMetersPerSecond: 10,
        },
      ],
      trafficSignals: [
        {
          id: "signal-1",
          roadId: "main-street",
          position: { x: 80, y: 0 },
          greenSeconds: 20,
          redSeconds: 20,
          offsetSeconds: 0,
        },
      ],
    });
    return buildRoadRuntime(built.roads[0], [], [], undefined, built.trafficSignals);
  }

  it("holds a vehicle before a red signal instead of driving through it", () => {
    const runtime = signalledRoad();
    let vehicles: VehicleAgent[] = [
      car({ progressMeters: 60, speedMetersPerSecond: 10 }),
    ];
    // elapsedSeconds=25 -> past greenSeconds=20 -> red.
    for (let i = 0; i < 300; i++) {
      vehicles = stepVehicles({
        dtSeconds: 1 / 10,
        elapsedSeconds: 25,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
    }
    expect(vehicles[0].progressMeters).toBeLessThan(80);
    expect(vehicles[0].progressMeters).toBeGreaterThan(70); // actually approached the line
  });

  it("lets a vehicle proceed through a green signal", () => {
    const runtime = signalledRoad();
    let vehicles: VehicleAgent[] = [
      car({ progressMeters: 60, speedMetersPerSecond: 10 }),
    ];
    // elapsedSeconds=5 -> within greenSeconds=20 -> green throughout.
    for (let i = 0; i < 100; i++) {
      vehicles = stepVehicles({
        dtSeconds: 1 / 10,
        elapsedSeconds: 5,
        pedestrians: [],
        random: alwaysOne,
        roads: [runtime],
        vehicles,
      });
      if (vehicles.length === 0) break; // despawned past the road's own end
    }
    // Despawned (drove all the way to the road's 100 m end) rather than
    // stuck sitting at the signal's 80 m stop line.
    expect(vehicles).toHaveLength(0);
  });
});
