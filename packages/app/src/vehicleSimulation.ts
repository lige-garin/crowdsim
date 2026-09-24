import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";

/**
 * SP-3 stage 1 (ADR-0001, ADR-0016): vehicles that drive along a road's own
 * polyline, react to a real vehicle ahead of them (IDM car-following) and to
 * a pedestrian occupying a marked crosswalk, and — for buses — stop at a
 * transit stop on their road for a dwell computed from that stop's own
 * existing schema fields.
 *
 * Wired into `simulationEngine.ts`/the worker/the viewport/the editor as of
 * ADR-0020 (2026-09-23): a `vehicleAccessible` road's traffic now actually
 * drives, is visible, and is toggleable without hand-editing JSON. Before
 * that it was standalone, the same shape this session's ORCA and Moussaïd
 * comparison layers took (ADR-0013, ADR-0014). This module itself is
 * unchanged by that wiring — it still has no notion of floors, decisions or
 * pedestrian lifecycle of its own; the engine calls `stepVehicles` once per
 * floor, the same way it steps a pedestrian crowd once per plane.
 *
 * Deliberately out of scope for stage 1, and not attempted here: a road
 * network (a vehicle only ever traverses the one road segment it spawned
 * on, start to end — no turns, no routing), intersections and signals,
 * congestion that propagates between roads, and any live pedestrian
 * ridership feeding a transit stop's boarding count (no code anywhere in
 * this project currently generates pedestrians who walk to and wait at a
 * transit stop — the closest thing, `bioAgentBehavior.ts`'s
 * `chooseTransitStop` scoring heuristic, was deleted as an orphan; see
 * CLAUDE.md's 孤儿模块 section). A bus's dwell therefore only ever accounts
 * for `alightingPerArrival` — its scripted per-arrival alighting count —
 * never a real boarding queue.
 */

export type LaneDirection = "forward" | "backward";
export type VehicleKind = "car" | "bus";

export type VehicleAgent = {
  id: string;
  roadId: string;
  /**
   * Copied from its road at spawn (`RoadRuntime.floorId`); absent on a
   * floor-less scene, exactly like `SimulationAgent.floorId`. This module
   * never reads it itself — it exists so the engine can bucket vehicles and
   * their road's pedestrians onto the same plane before calling `stepVehicles`,
   * and so the viewport can show only the vehicles on the floor being viewed.
   */
  floorId?: string;
  laneDirection: LaneDirection;
  kind: VehicleKind;
  /** 0 at spawn, `road.totalLengthMeters` at despawn — always increasing,
   * regardless of `laneDirection` (see `worldPositionAtProgress`). */
  progressMeters: number;
  speedMetersPerSecond: number;
  /** > 0 while a bus is stopped at a stop; counts down to 0. */
  dwellRemainingSeconds: number;
  /** Stops already served this trip, so a lingering bus doesn't re-trigger
   * its own dwell every tick it's still near the stop. */
  dwelledStopIds: readonly string[];
  x: number;
  y: number;
  /** Which way it's facing, scene-coordinate radians — `worldPositionAtProgress`'s
   * own heading, kept alongside x/y the same way it's computed alongside them. */
  headingRadians: number;
};

export type RoadRuntimeCrosswalk = {
  id: string;
  /** Arclength from `points[0]`, independent of travel direction. */
  forwardArclengthMeters: number;
  widthMeters: number;
};

export type RoadRuntimeStop = {
  id: string;
  forwardArclengthMeters: number;
  alightingPerArrival: number;
};

export type RoadRuntime = {
  id: string;
  /** Copied onto every vehicle spawned on this road; see `VehicleAgent.floorId`. */
  floorId?: string;
  points: readonly ScenePoint[];
  /** `cumulative[i]` = arclength from `points[0]` to `points[i]`. */
  cumulative: readonly number[];
  totalLengthMeters: number;
  directions: readonly LaneDirection[];
  speedLimitMetersPerSecond: number;
  /** Vehicles spawned per minute, per direction in `directions`. */
  arrivalRatePerMinutePerDirection: number;
  crosswalks: readonly RoadRuntimeCrosswalk[];
  stops: readonly RoadRuntimeStop[];
};

const idmParameters = {
  /** Order-of-magnitude IDM defaults from the traffic-flow literature
   * (Treiber, Hennecke & Helbing 2000) — not fitted to this project, the
   * same disclosure ADR-0013's ORCA parameters carry. */
  comfortDecelMetersPerSecond2: 2.0,
  maxAccelMetersPerSecond2: 1.5,
  minGapMeters: 2,
  timeHeadwaySeconds: 1.5,
};
/** Bumper-to-bumper spacing subtracted from progress deltas. A city-block
 * placeholder, not a measured fleet mix. */
const vehicleLengthMeters = 4.5;
/** A bus door's fixed open/close overhead, the same role `doorSeconds` plays
 * for an elevator (ADR-0010 stage 6) — a placeholder, not measured. */
const busDoorSeconds = 8;
/** People per second a bus's doors can discharge — a commonly cited
 * transit-engineering order of magnitude, not validated for this project. */
const assumedAlightingRatePerSecond = 1;
const minSpawnGapMeters = vehicleLengthMeters * 2;
/**
 * How close a bus's front must get to a stop's own arclength before it is
 * treated as "arrived" and begins its dwell. Must be greater than
 * `idmParameters.minGapMeters` (2 m): IDM's car-following only ever
 * *asymptotically* approaches a stationary obstacle at that equilibrium
 * gap, the same way it approaches a stopped leader, and never mathematically
 * closes to exactly `minGapMeters` in finite time — a tolerance at or below
 * it would never actually fire.
 */
const busStopArrivalToleranceMeters = 2.5;

export function buildRoadRuntime(
  road: CrowdSimScene["roads"][number],
  crosswalks: readonly CrowdSimScene["crosswalks"][number][],
  stops: readonly CrowdSimScene["transitStops"][number][],
  /** Resolved by the caller (`resolveFloorId`), not read off `road` directly:
   * a road with no `floorId` of its own still belongs to a scene's base
   * floor once that scene declares floors at all. */
  floorId?: string,
): RoadRuntime {
  const points = road.geometry.points;
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  }
  const totalLengthMeters = cumulative[cumulative.length - 1] ?? 0;

  const directions: LaneDirection[] =
    road.direction === "oneWayForward"
      ? ["forward"]
      : road.direction === "oneWayBackward"
        ? ["backward"]
        : ["forward", "backward"];

  return {
    arrivalRatePerMinutePerDirection: road.vehicleArrivalRatePerMinute,
    crosswalks: crosswalks
      .filter((crosswalk) => crosswalk.roadId === road.id)
      .map((crosswalk) => ({
        forwardArclengthMeters: projectToArclength(
          points,
          cumulative,
          crosswalk.position,
        ),
        id: crosswalk.id,
        widthMeters: crosswalk.widthMeters,
      })),
    cumulative,
    directions,
    floorId,
    id: road.id,
    points,
    speedLimitMetersPerSecond: road.vehicleSpeedLimitMetersPerSecond,
    stops: stops
      .filter((stop) => stop.roadId === road.id)
      .map((stop) => ({
        alightingPerArrival: stop.alightingPerArrival,
        forwardArclengthMeters: projectToArclength(points, cumulative, stop.position),
        id: stop.id,
      })),
    totalLengthMeters,
  };
}

/** A vehicle's world position always advances `progressMeters` from 0 to
 * `totalLengthMeters` regardless of direction; only the arclength (and so
 * the point on the road) it corresponds to differs. */
export type VehiclePose = ScenePoint & {
  /** Which way the vehicle is facing, scene-coordinate radians (`atan2` of
   * the road segment it's on, 0 = +x) — a renderer maps this to its own
   * rotation convention, the same as it already does for position. */
  headingRadians: number;
};

export function worldPositionAtProgress(
  road: RoadRuntime,
  laneDirection: LaneDirection,
  progressMeters: number,
): VehiclePose {
  const arclength =
    laneDirection === "forward"
      ? progressMeters
      : road.totalLengthMeters - progressMeters;
  const { point, headingRadians } = poseAtArclength(
    road.points,
    road.cumulative,
    arclength,
  );
  // Travelling "backward" walks the same polyline tail-to-head, so its
  // facing is the forward segment's heading turned around, not the forward
  // heading itself.
  return {
    ...point,
    headingRadians:
      laneDirection === "forward" ? headingRadians : headingRadians + Math.PI,
  };
}

/** How far ahead of a vehicle at `progressMeters` a road feature (given by
 * its direction-independent forward arclength) is, along this vehicle's
 * own direction of travel. Negative or `Infinity`-bound callers should treat
 * a non-positive result as already passed. */
function progressToFeature(
  road: RoadRuntime,
  laneDirection: LaneDirection,
  progressMeters: number,
  featureForwardArclengthMeters: number,
): number {
  return laneDirection === "forward"
    ? featureForwardArclengthMeters - progressMeters
    : road.totalLengthMeters - featureForwardArclengthMeters - progressMeters;
}

function idmAcceleration(
  speedMetersPerSecond: number,
  desiredSpeedMetersPerSecond: number,
  gapMeters: number,
  closingSpeedMetersPerSecond: number,
): number {
  const {
    comfortDecelMetersPerSecond2,
    maxAccelMetersPerSecond2,
    minGapMeters,
    timeHeadwaySeconds,
  } = idmParameters;
  const desiredGap =
    minGapMeters +
    Math.max(
      0,
      speedMetersPerSecond * timeHeadwaySeconds +
        (speedMetersPerSecond * closingSpeedMetersPerSecond) /
          (2 * Math.sqrt(maxAccelMetersPerSecond2 * comfortDecelMetersPerSecond2)),
    );
  const gap = Math.max(gapMeters, 0.1);
  return (
    maxAccelMetersPerSecond2 *
    (1 -
      (speedMetersPerSecond / desiredSpeedMetersPerSecond) ** 4 -
      (desiredGap / gap) ** 2)
  );
}

export type PedestrianLike = { x: number; y: number };

export type VehicleStepInput = {
  vehicles: readonly VehicleAgent[];
  roads: readonly RoadRuntime[];
  /** Pedestrians on the same floor as the road network being stepped —
   * callers filter by floor before calling, this module has no notion of
   * floors of its own. */
  pedestrians: readonly PedestrianLike[];
  dtSeconds: number;
  /** Deterministic spawn draws, the same role `seed`/`rand` play throughout
   * this project's engine (`simulationEngine.ts`'s own `spawnArrivals`). */
  random: () => number;
};

export function stepVehicles(input: VehicleStepInput): VehicleAgent[] {
  const { dtSeconds, pedestrians, random, roads, vehicles } = input;
  const roadsById = new Map(roads.map((road) => [road.id, road]));

  const stepped: VehicleAgent[] = [];
  for (const road of roads) {
    for (const laneDirection of road.directions) {
      const queue = vehicles
        .filter(
          (vehicle) =>
            vehicle.roadId === road.id && vehicle.laneDirection === laneDirection,
        )
        .sort((a, b) => a.progressMeters - b.progressMeters);

      for (const [index, vehicle] of queue.entries()) {
        stepped.push(
          stepOneVehicle(
            vehicle,
            road,
            laneDirection,
            queue[index + 1],
            pedestrians,
            dtSeconds,
          ),
        );
      }
    }
  }

  return (
    [...stepped, ...spawnVehicles(roads, vehicles, random, dtSeconds)]
      // Despawn: a vehicle that reached its road's far end this tick is
      // dropped here, not kept clamped at `totalLengthMeters` — otherwise it
      // would sit at the terminus forever, jamming everyone still queued
      // behind it. It was still a valid leader for whoever was behind it
      // during the tick that retired it (queue lookups above ran first).
      //
      // `roadsById.get(vehicle.roadId)` below is never undefined: `stepped`
      // (built by iterating `roads` above) and `spawnVehicles` (same) both
      // only ever produce vehicles whose `roadId` came from this tick's own
      // `roads` array, never from `vehicles`' possibly-stale input list. A
      // road deleted mid-simulation just stops appearing in `roads`, so its
      // vehicles are silently dropped by the same iteration rather than
      // reaching this lookup with a dangling id.
      .filter(
        (vehicle) =>
          vehicle.progressMeters < roadsById.get(vehicle.roadId)!.totalLengthMeters,
      )
      .map((vehicle) => {
        const road = roadsById.get(vehicle.roadId)!;
        const { x, y, headingRadians } = worldPositionAtProgress(
          road,
          vehicle.laneDirection,
          vehicle.progressMeters,
        );
        return { ...vehicle, x, y, headingRadians };
      })
  );
}

function stepOneVehicle(
  vehicle: VehicleAgent,
  road: RoadRuntime,
  laneDirection: LaneDirection,
  leader: VehicleAgent | undefined,
  pedestrians: readonly PedestrianLike[],
  dtSeconds: number,
): VehicleAgent {
  if (vehicle.dwellRemainingSeconds > 0) {
    const remaining = vehicle.dwellRemainingSeconds - dtSeconds;
    return remaining <= 0
      ? { ...vehicle, dwellRemainingSeconds: 0 }
      : { ...vehicle, dwellRemainingSeconds: remaining, speedMetersPerSecond: 0 };
  }

  const constraints: { gapMeters: number; leadSpeedMetersPerSecond: number }[] = [];

  if (vehicle.kind === "bus") {
    // The nearest not-yet-served stop ahead: treated as a stationary
    // obstacle so the bus decelerates smoothly on approach (the same IDM
    // constraint a crosswalk or a slower leader is), rather than snapping to
    // a stop only on the one tick its progress happens to exactly cross the
    // stop's arclength.
    const next = road.stops
      .filter((stop) => !vehicle.dwelledStopIds.includes(stop.id))
      .map((stop) => ({
        gapMeters: progressToFeature(
          road,
          laneDirection,
          vehicle.progressMeters,
          stop.forwardArclengthMeters,
        ),
        stop,
      }))
      .filter(({ gapMeters }) => gapMeters > -vehicleLengthMeters)
      .sort((a, b) => a.gapMeters - b.gapMeters)[0];

    if (next && next.gapMeters <= busStopArrivalToleranceMeters) {
      return {
        ...vehicle,
        dwellRemainingSeconds:
          busDoorSeconds +
          next.stop.alightingPerArrival / assumedAlightingRatePerSecond,
        dwelledStopIds: [...vehicle.dwelledStopIds, next.stop.id],
        speedMetersPerSecond: 0,
      };
    }
    if (next) {
      constraints.push({
        gapMeters: Math.max(next.gapMeters, 0.1),
        leadSpeedMetersPerSecond: 0,
      });
    }
  }

  if (leader) {
    constraints.push({
      gapMeters: leader.progressMeters - vehicle.progressMeters - vehicleLengthMeters,
      leadSpeedMetersPerSecond: leader.speedMetersPerSecond,
    });
  }

  for (const crosswalk of road.crosswalks) {
    const gap = progressToFeature(
      road,
      laneDirection,
      vehicle.progressMeters,
      crosswalk.forwardArclengthMeters,
    );
    if (gap <= 0) continue;
    // The crosswalk's own world position: its forward arclength is already
    // absolute (measured from points[0]), independent of the vehicle's
    // direction of travel, so this reads off the polyline directly rather
    // than going through the direction-relative progress transform above.
    const crosswalkPoint = poseAtArclength(
      road.points,
      road.cumulative,
      crosswalk.forwardArclengthMeters,
    ).point;
    const occupied = pedestrians.some(
      (pedestrian) => distance(pedestrian, crosswalkPoint) <= crosswalk.widthMeters / 2,
    );
    if (occupied) {
      constraints.push({ gapMeters: gap, leadSpeedMetersPerSecond: 0 });
    }
  }

  const acceleration =
    constraints.length === 0
      ? idmParameters.maxAccelMetersPerSecond2 *
        (1 - (vehicle.speedMetersPerSecond / road.speedLimitMetersPerSecond) ** 4)
      : Math.min(
          ...constraints.map((constraint) =>
            idmAcceleration(
              vehicle.speedMetersPerSecond,
              road.speedLimitMetersPerSecond,
              constraint.gapMeters,
              vehicle.speedMetersPerSecond - constraint.leadSpeedMetersPerSecond,
            ),
          ),
        );

  const speedMetersPerSecond = Math.max(
    0,
    vehicle.speedMetersPerSecond + acceleration * dtSeconds,
  );
  const progressMeters = Math.min(
    road.totalLengthMeters,
    vehicle.progressMeters + speedMetersPerSecond * dtSeconds,
  );

  return { ...vehicle, progressMeters, speedMetersPerSecond };
}

function spawnVehicles(
  roads: readonly RoadRuntime[],
  vehicles: readonly VehicleAgent[],
  random: () => number,
  dtSeconds: number,
): VehicleAgent[] {
  const spawned: VehicleAgent[] = [];
  for (const road of roads) {
    if (road.arrivalRatePerMinutePerDirection <= 0) continue;
    for (const laneDirection of road.directions) {
      const probability = (road.arrivalRatePerMinutePerDirection / 60) * dtSeconds;
      if (random() >= probability) continue;

      const nearEntry = vehicles.some(
        (vehicle) =>
          vehicle.roadId === road.id &&
          vehicle.laneDirection === laneDirection &&
          vehicle.progressMeters < minSpawnGapMeters,
      );
      if (nearEntry) continue;

      const { x, y, headingRadians } = worldPositionAtProgress(road, laneDirection, 0);
      spawned.push({
        dwellRemainingSeconds: 0,
        dwelledStopIds: [],
        floorId: road.floorId,
        headingRadians,
        id: `${road.id}-${laneDirection}-${Math.floor(random() * 1e9)}`,
        kind: "car",
        laneDirection,
        progressMeters: 0,
        roadId: road.id,
        speedMetersPerSecond: 0,
        x,
        y,
      });
    }
  }
  return spawned;
}

/** A point on the polyline plus the heading (`atan2`, scene radians) of
 * whichever segment it falls on — the one place both position and facing
 * come from the same segment lookup, instead of a caller that wants both
 * searching the polyline twice. */
function poseAtArclength(
  points: readonly ScenePoint[],
  cumulative: readonly number[],
  arclength: number,
): { point: ScenePoint; headingRadians: number } {
  const clamped = Math.max(
    0,
    Math.min(cumulative[cumulative.length - 1] ?? 0, arclength),
  );
  for (let i = 1; i < points.length; i++) {
    if (clamped <= cumulative[i]) {
      const segmentLength = cumulative[i] - cumulative[i - 1];
      const t = segmentLength > 0 ? (clamped - cumulative[i - 1]) / segmentLength : 0;
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      return {
        point: {
          x: points[i - 1].x + dx * t,
          y: points[i - 1].y + dy * t,
        },
        headingRadians: Math.atan2(dy, dx),
      };
    }
  }
  const last = points[points.length - 1];
  const previous = points[points.length - 2] ?? last;
  return {
    point: last,
    headingRadians: Math.atan2(last.y - previous.y, last.x - previous.x),
  };
}

/** Nearest point on the polyline to `target`, returned as forward arclength.
 * A scene author is expected to place a crosswalk/stop roughly on its road;
 * this does not search off-road for the "true" nearest road. */
function projectToArclength(
  points: readonly ScenePoint[],
  cumulative: readonly number[],
  target: ScenePoint,
): number {
  let best = { arclength: 0, distanceSquared: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segmentLength = cumulative[i] - cumulative[i - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared > 0
        ? clamp01(((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSquared)
        : 0;
    const projected = { x: a.x + dx * t, y: a.y + dy * t };
    const distanceSquared =
      (target.x - projected.x) ** 2 + (target.y - projected.y) ** 2;
    if (distanceSquared < best.distanceSquared) {
      best = { arclength: cumulative[i - 1] + segmentLength * t, distanceSquared };
    }
  }
  return best.arclength;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function distance(a: ScenePoint, b: ScenePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
