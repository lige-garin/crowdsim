import type { ScenePoint } from "@crowdsim/scene-schema";
import type { Router } from "./crowdNavigation";

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
  kind: "escalator" | "stair";
  fromFloorId: string;
  fromPoint: ScenePoint;
  toFloorId: string;
  toPoint: ScenePoint;
  /** Seconds to travel it, one person's journey (`connectorTravelSeconds`). */
  travelSeconds: number;
  /** People a second it can take, from its width (ADR-0008's rule). */
  admitPerSecond: number;
};

/**
 * Travel speeds along the flight, m/s. **Literature-typical, not calibrated
 * here** — this project has no measured stair or escalator flow.
 *
 * - Stairs: Weidmann (1993) gives 0.61 m/s going up and 0.694 m/s going down,
 *   the same survey this project takes its level walking speed from (Jülich
 *   IAS Series 13, table of walking speeds).
 * - Escalator: 0.5 m/s, the nominal speed of a commercial escalator (EN 115
 *   permits 0.5–0.75 m/s; 0.5 is what is usually fitted).
 */
export const connectorSpeeds = {
  escalator: 0.5,
  stairUp: 0.61,
  stairDown: 0.694,
} as const;

/**
 * The pitch of a flight, degrees. 30° is the standard escalator angle and the
 * middle of the range a public staircase is built to, so the travelled length
 * is twice the height climbed (1/sin 30° = 2).
 */
export const connectorPitchDegrees = 30;

/** How long one person takes to travel a connector that rises `riseMeters`. */
export function connectorTravelSeconds(
  kind: "escalator" | "stair",
  riseMeters: number,
  speedMetersPerSecond?: number,
): number {
  const rise = Math.abs(riseMeters);
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
