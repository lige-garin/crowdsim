import type { WallSegment } from "@crowdsim/core-gpu";
import type { ScenePoint } from "@crowdsim/scene-schema";
import type { Router } from "./crowdNavigation";
import type { SceneWorldBounds } from "./sceneGeometry";

/**
 * Getting from a place on one floor to a place on another (ADR-0010, stage 3).
 *
 * Each floor keeps its own 2D router (`crowdNavigation`), and connectors are
 * the edges between them. A journey is then: walk to a connector, ride or
 * climb it, walk on — repeated until the destination floor is reached.
 *
 * Costs are all in **metres of walking**, so that a route up a floor can be
 * compared with a walk across one: a connector costs the time it takes to
 * travel multiplied by the crowd's mean walking speed. That is the only
 * conversion that lets one number decide "is the shop upstairs nearer than the
 * one at the far end of this floor".
 */

export type FloorPlace = {
  x: number;
  y: number;
  /** Absent in a scene with no floors, where there is only one plane. */
  floorId?: string;
};

export type ConnectorRuntime = {
  id: string;
  kind: "escalator" | "stair" | "elevator";
  /**
   * The scene-authored connector this runtime came from, before any `:down`
   * direction suffix (`sceneConnectorRuntimes`). A stair's two directions
   * never share state, so this only matters for a lift: both of its
   * directions carry the same `shaftId`, which is what `createElevatorRuntime`
   * keys a shaft's cars by — one physical car pool serving both directions,
   * not two independent ones.
   */
  shaftId: string;
  fromFloorId: string;
  fromPoint: ScenePoint;
  toFloorId: string;
  toPoint: ScenePoint;
  /** Seconds to travel it at the default speed (`connectorTravelSeconds`). */
  travelSeconds: number;
  /** Metres of flight, so a person with their own speed can time it themselves. */
  lengthMeters: number;
  /** Which way this one goes: true when it climbs. */
  climbing: boolean;
  /** People a second it can take, from its width (ADR-0008's rule). Not how a lift is limited — see `capacity`. */
  admitPerSecond: number;
  /** Clear walking width, m — the flight's own short dimension (`buildFlightLane`). Not meaningful for a lift. */
  width: number;
  /** A lift car's passenger limit. Only present for `kind: "elevator"`. */
  capacity?: number;
  /** Cars sharing this shaft. Only present for `kind: "elevator"`. */
  carCount?: number;
  /** Seconds a lift's doors stay open at a stop. Only present for `kind: "elevator"`. */
  doorSeconds?: number;
};

/** Shortest a flight lane is ever built, m: a connector between floors at the
 * same elevation has zero rise and so zero length by `connectorLengthMeters`,
 * but a crowd still needs a corridor to stand in, not a point. */
const minFlightLengthMeters = 1;

/** A connector's own lane length, m — never shorter than a crowd can stand in
 * even when its rise (and so `lengthMeters`) is zero. What `buildFlightLane`
 * actually builds and what a rider actually walks, so anything that needs to
 * agree with that geometry (`personFlightSpeedMetersPerSecond`,
 * `floorTransfers`'s boarding) reads it from here rather than the raw field. */
export function flightLengthMeters(
  connector: Pick<ConnectorRuntime, "lengthMeters">,
): number {
  return Math.max(connector.lengthMeters, minFlightLengthMeters);
}

/** The synthetic floor id a connector's own lane is stepped under while
 * someone is on it (`buildFlightLane`, `simulationEngine`'s floor loop). Never
 * collides with a real floor id, which comes from the scene, not this prefix. */
export function flightFloorId(connectorId: string): string {
  return `flight:${connectorId}`;
}

/**
 * A lift shaft's `carCount` cars each get their own physical floor, not one
 * shared between them — two cars in the same shaft are two boxes, never
 * occupying the same space. `carIndex` is stable per car for the run
 * (`elevatorTransfers.createElevatorRuntime` assigns it once, in order).
 */
export function elevatorCarFloorId(shaftId: string, carIndex: number): string {
  return `${flightFloorId(shaftId)}:car${carIndex}`;
}

/**
 * Whether `floorId` is *some* flight of this shaft — its stair/escalator
 * lane, or any one of its lift's cars. A plain `===` against
 * `flightFloorId(shaftId)` would miss every car floor; a bare prefix check
 * would also match a different shaft whose id happens to start with this
 * one's (`"lift-1"` against `"lift-10"`), which the required `:car` after
 * the shaft id rules out.
 */
export function isOnShaftFlight(floorId: string | undefined, shaftId: string): boolean {
  if (floorId === undefined) {
    return false;
  }
  const base = flightFloorId(shaftId);
  return floorId === base || floorId.startsWith(`${base}:car`);
}

/**
 * A lift car's own floor area, metres square (a lift's holding pen is a box,
 * not a corridor — see `buildFlightLane`). Scaled off `capacity` by area
 * (`sqrt`, since a car is roughly square) against an 8-person car's own
 * typical interior — EN 81 lists car sizes by rated load; the common ~630 kg
 * (8-person) car is on the order of 1.6 m square. Self-chosen scaling, not a
 * standard's own formula, and never below 1.2 m, since a car does not shrink
 * to a point at low capacity.
 */
export function elevatorCarSideMeters(capacity: number): number {
  return Math.max(1.2, 1.6 * Math.sqrt(capacity / 8));
}

/**
 * A connector's own walkable geometry (ADR-0010, stage 5): a straight corridor
 * `lengthMeters` long and `width` wide, in coordinates of its own — 0 at the
 * `from` mouth, `lengthMeters` at the `to` mouth, laid out this way (rather
 * than in either floor's plan coordinates) because the two mouths generally
 * sit at different points on two different plans, with nothing in common to
 * place a straight flight between.
 *
 * Once a person is placed here, `crowdMovement`'s ordinary social force steps
 * them exactly as it would in any corridor: pushed by whoever else is on the
 * flight, held off the two side walls. That is deliberate — it is how this
 * project gets a stair's speed–density relation (RiMEA test 13) as a measured
 * outcome of the same model that produces one for a level corridor, rather
 * than a second, hand-authored formula for stairs specifically.
 *
 * The walls returned here are for that push and for `constrainMovement`'s hard
 * collision only — they are never passed to `createRouter`, which would grid
 * and block the corridor's cells with them; a flight narrower than a couple of
 * routing cells would come out fully blocked. A flight has nothing to route
 * around between its two mouths, so its router is the plain straight line
 * `createRouter` already returns when given no walls.
 *
 * A lift (ADR-0010, stage 6) gets a small enclosed box instead of a corridor —
 * riders do not walk toward a far mouth, `stepElevatorTravel`'s own door/travel
 * timing decides when they leave, not distance — four walls, not two, so
 * nobody drifts out a side that a corridor's open ends do not have.
 */
export function buildFlightLane(connector: ConnectorRuntime): {
  world: SceneWorldBounds;
  walls: WallSegment[];
} {
  if (connector.kind === "elevator") {
    const side = elevatorCarSideMeters(connector.capacity ?? defaultElevatorCapacity);
    const world: SceneWorldBounds = { width: side, height: side };

    return {
      world,
      walls: [
        { x1: 0, y1: 0, x2: side, y2: 0 },
        { x1: 0, y1: side, x2: side, y2: side },
        { x1: 0, y1: 0, x2: 0, y2: side },
        { x1: side, y1: 0, x2: side, y2: side },
      ],
    };
  }

  const length = flightLengthMeters(connector);
  const world: SceneWorldBounds = { width: length, height: connector.width };

  return {
    world,
    walls: [
      { x1: 0, y1: 0, x2: length, y2: 0 },
      { x1: 0, y1: connector.width, x2: length, y2: connector.width },
    ],
  };
}

/**
 * Travel speeds along the flight, m/s. **Literature-typical, not calibrated
 * here** — this project has no measured stair, escalator or lift flow.
 *
 * - Stairs: Weidmann (1993) gives 0.61 m/s going up and 0.694 m/s going down,
 *   the same survey this project takes its level walking speed from (Jülich
 *   IAS Series 13, table of walking speeds).
 * - Escalator: 0.5 m/s, the nominal speed of a commercial escalator (EN 115
 *   permits 0.5–0.75 m/s; 0.5 is what is usually fitted).
 * - Lift: 1.0 m/s, a typical car speed for a low-rise bank (a handful of
 *   floors, which is every scene this project has); high-rise cars run
 *   faster, but nothing built here has that many floors to justify one.
 */
export const connectorSpeeds = {
  elevator: 1.0,
  escalator: 0.5,
  stairUp: 0.61,
  stairDown: 0.694,
} as const;

/**
 * Default door-open time, seconds, for a connector whose scene entry omits
 * `doorSeconds` — only reached when `connectorTravelSeconds` is called
 * without a scene to read the field from (e.g. a test's own fixture).
 * Self-chosen, matching `connectorSchema`'s own default.
 */
export const defaultElevatorDoorSeconds = 4;

/** Default car capacity for a connector whose scene entry omits `capacity`
 * — matches `connectorSchema`'s own default, the same fallback role
 * `defaultElevatorDoorSeconds` plays for door time. */
export const defaultElevatorCapacity = 8;

/**
 * The pitch of a flight, degrees. 30° is the standard escalator angle and the
 * middle of the range a public staircase is built to, so the travelled length
 * is twice the height climbed (1/sin 30° = 2).
 */
export const connectorPitchDegrees = 30;

/**
 * Metres walked along a flight that rises `riseMeters`, at a 30 degree pitch —
 * or, for a lift, the straight vertical rise itself: a car travels the shaft,
 * not a slope. Only meaningful for `ConnectorRuntime.lengthMeters`, which a
 * lift's own `buildFlightLane` branch does not read (its car footprint comes
 * from `elevatorCarSideMeters` instead); kept here as the connector's own
 * honest record of how far its car actually travels.
 */
export function connectorLengthMeters(
  riseMeters: number,
  kind: "escalator" | "stair" | "elevator",
) {
  return kind === "elevator"
    ? Math.abs(riseMeters)
    : Math.abs(riseMeters) / Math.sin((connectorPitchDegrees * Math.PI) / 180);
}

/**
 * How long this person takes on a flight of `lengthMeters`, at their own stair
 * speed (ADR-0011). Falls back to the connector's default time for anyone the
 * scene drew no profile for.
 */
export function personTravelSeconds(
  connector: Pick<ConnectorRuntime, "climbing" | "lengthMeters" | "travelSeconds">,
  person: { stairUpMetersPerSecond?: number; stairDownMetersPerSecond?: number },
) {
  const speed = connector.climbing
    ? person.stairUpMetersPerSecond
    : person.stairDownMetersPerSecond;

  return speed === undefined
    ? connector.travelSeconds
    : Math.max(connector.lengthMeters / speed, 1);
}

/**
 * This person's free speed while actually walking a flight, m/s: the lane's
 * own length as `buildFlightLane` builds it (never zero, even for a same-
 * height connector) divided by how long `personTravelSeconds` says they take
 * to cross it. A stair or escalator has its own literature speed — this is
 * not the scene's walking speed times the person's `speedFactor`.
 */
export function personFlightSpeedMetersPerSecond(
  connector: Pick<ConnectorRuntime, "climbing" | "lengthMeters" | "travelSeconds">,
  person: { stairUpMetersPerSecond?: number; stairDownMetersPerSecond?: number },
): number {
  return flightLengthMeters(connector) / personTravelSeconds(connector, person);
}

/**
 * How long one person takes to travel a connector that rises `riseMeters` —
 * for a lift, a **routing-cost estimate**: the graph (`createFloorGraph`)
 * needs one static number per connector to compare "walk" against "ride", the
 * same way it does for a stair, and this is a car going straight up (no 30°
 * pitch) plus one door cycle each end, not a live prediction of how long
 * anyone actually waits — the real wait, capacity and queueing come from the
 * car simulation (`floorTransfers.stepElevatorTravel`), which this number
 * does not drive.
 */
export function connectorTravelSeconds(
  kind: "escalator" | "stair" | "elevator",
  riseMeters: number,
  speedMetersPerSecond?: number,
  doorSeconds: number = defaultElevatorDoorSeconds,
): number {
  const rise = Math.abs(riseMeters);

  if (kind === "elevator") {
    const speed = speedMetersPerSecond ?? connectorSpeeds.elevator;
    return Math.max(rise / speed, 1) + 2 * doorSeconds;
  }

  const length = rise / Math.sin((connectorPitchDegrees * Math.PI) / 180);
  const speed =
    speedMetersPerSecond ??
    (kind === "escalator"
      ? connectorSpeeds.escalator
      : riseMeters >= 0
        ? connectorSpeeds.stairUp
        : connectorSpeeds.stairDown);

  // A connector between two floors at the same height still takes a moment to
  // cross; without this a zero-rise link would be free and routes would prefer
  // it over any walk.
  return Math.max(length / speed, 1);
}

/**
 * How long a lift car's own ride takes, doors excluded — the two door
 * openings `connectorTravelSeconds` folds into its routing-cost estimate,
 * subtracted back out, rather than recomputed from scratch, so the two stay
 * in the one relationship instead of two formulas that could drift apart.
 * This is what `elevatorTransfers.stepElevatorTravel` actually times a car's
 * `"moving"` phase against; `connectorTravelSeconds` is not read at runtime.
 */
export function elevatorRideSeconds(
  connector: Pick<ConnectorRuntime, "travelSeconds" | "doorSeconds">,
): number {
  const doorSeconds = connector.doorSeconds ?? defaultElevatorDoorSeconds;
  return Math.max(connector.travelSeconds - 2 * doorSeconds, 1);
}

export type FloorGraph = {
  /** Walking metres from one place to another, across floors; Infinity if cut off. */
  distance: (from: FloorPlace, to: FloorPlace) => number;
  /**
   * The connector to head for next, or null when the destination is on this
   * floor and can be walked to directly.
   */
  nextConnector: (from: FloorPlace, to: FloorPlace) => ConnectorRuntime | null;
  connectors: readonly ConnectorRuntime[];
};

export function createFloorGraph({
  connectors,
  meanSpeedMetersPerSecond,
  routerFor,
}: {
  connectors: readonly ConnectorRuntime[];
  /** Turns a connector's travel time into walking metres. */
  meanSpeedMetersPerSecond: number;
  /** The router for a floor, or undefined when the scene has no such floor. */
  routerFor: (floorId: string | undefined) => Router | undefined;
}): FloorGraph {
  const rideCost = (connector: ConnectorRuntime) =>
    connector.travelSeconds * meanSpeedMetersPerSecond;

  /** Walking distance within one floor; Infinity when that floor is unknown. */
  function walk(floorId: string | undefined, from: ScenePoint, to: ScenePoint) {
    const router = routerFor(floorId);

    return router ? router.distance(from, to) : Infinity;
  }

  /**
   * Between fixed points, so it is computed once and kept: the same pair is
   * asked for by every walker deciding where to go.
   */
  const betweenConnectors = new Map<string, number>();

  function hopCost(exit: ConnectorRuntime, entry: ConnectorRuntime) {
    const key = `${exit.id}>${entry.id}`;
    const known = betweenConnectors.get(key);

    if (known !== undefined) {
      return known;
    }

    const cost =
      exit.toFloorId === entry.fromFloorId
        ? walk(exit.toFloorId, exit.toPoint, entry.fromPoint) + rideCost(entry)
        : Infinity;

    betweenConnectors.set(key, cost);
    return cost;
  }

  /**
   * Dijkstra over connectors: the nodes are "having just stepped off connector
   * i", plus the start. There are a handful of connectors in a building, so
   * the whole search is smaller than one step of the grid routing it calls.
   */
  function search(from: FloorPlace, to: FloorPlace) {
    const best = new Map<string, number>();
    const firstHop = new Map<string, ConnectorRuntime>();
    const queue: ConnectorRuntime[] = [];

    for (const connector of connectors) {
      if (connector.fromFloorId !== from.floorId) {
        continue;
      }

      const cost = walk(from.floorId, from, connector.fromPoint) + rideCost(connector);

      if (!Number.isFinite(cost)) {
        continue;
      }

      if (cost < (best.get(connector.id) ?? Infinity)) {
        best.set(connector.id, cost);
        firstHop.set(connector.id, connector);
        queue.push(connector);
      }
    }

    // Relax until nothing improves. The graph is tiny, so a plain pass over it
    // repeated while anything changed is cheaper than a heap.
    for (let round = 0; round < connectors.length && queue.length > 0; round += 1) {
      let changed = false;

      for (const exit of connectors) {
        const reached = best.get(exit.id);

        if (reached === undefined) {
          continue;
        }

        for (const entry of connectors) {
          if (entry.id === exit.id) {
            continue;
          }

          const cost = reached + hopCost(exit, entry);

          if (cost < (best.get(entry.id) ?? Infinity)) {
            best.set(entry.id, cost);
            firstHop.set(entry.id, firstHop.get(exit.id)!);
            changed = true;
          }
        }
      }

      if (!changed) {
        break;
      }
    }

    let bestCost = Infinity;
    let bestFirst: ConnectorRuntime | null = null;

    for (const connector of connectors) {
      const reached = best.get(connector.id);

      if (reached === undefined || connector.toFloorId !== to.floorId) {
        continue;
      }

      const cost = reached + walk(to.floorId, connector.toPoint, to);

      if (cost < bestCost) {
        bestCost = cost;
        bestFirst = firstHop.get(connector.id) ?? null;
      }
    }

    return { cost: bestCost, first: bestFirst };
  }

  return {
    connectors,
    distance(from, to) {
      if ((from.floorId ?? null) === (to.floorId ?? null)) {
        return walk(from.floorId, from, to);
      }

      return search(from, to).cost;
    },
    nextConnector(from, to) {
      if ((from.floorId ?? null) === (to.floorId ?? null)) {
        return null;
      }

      return search(from, to).first;
    },
  };
}
