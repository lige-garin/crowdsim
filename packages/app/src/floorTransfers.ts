import {
  personTravelSeconds,
  type FloorGraph,
  type ConnectorRuntime,
} from "./floorRouting";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import { nearestAllowedSink } from "./simulationDecisionBackend";

/**
 * Crossing between floors (ADR-0010, stage 4).
 *
 * A walk to somewhere on another floor is broken into legs: walk to the
 * connector, travel it, walk on. `targetX`/`targetY` always hold **the leg
 * being walked now**, so everything that steers a crowd — the social force,
 * the wall constraint, the queueing — keeps working on one plane and never has
 * to know that floors exist. Where the person is really going is kept in
 * `transfer` until they get to that floor.
 *
 * While travelling a connector a person is not in any crowd: they are on the
 * treads. They are still in the run, still counted, and they reappear at the
 * far end after the time the flight takes.
 */

/** How close to a connector's mouth someone must be to step on. */
export const boardingRadiusMeters = 1.2;

export function isRiding(agent: SimulationAgent): boolean {
  return agent.ridingUntilSeconds !== undefined;
}

/**
 * Whether this person is in the middle of crossing between floors: on the
 * treads, or waiting at the mouth for room on them.
 *
 * Neither closes the distance to where they are going — a rider is held still
 * for the whole flight, and a queue for an escalator is people standing. To
 * any rule that measures progress in metres both look exactly like being
 * stuck against a wall, so the rule has to be told the difference.
 */
export function isCrossingFloors(agent: SimulationAgent): boolean {
  if (isRiding(agent)) {
    return true;
  }

  if (!agent.transfer) {
    return false;
  }

  // With a transfer set, the target is the connector's mouth (planFloorLegs).
  const dx = agent.targetX - agent.x;
  const dy = agent.targetY - agent.y;

  return Math.sqrt(dx * dx + dy * dy) <= boardingRadiusMeters;
}

/** Where this person is really going, whether or not a leg is in progress. */
function destinationOf(agent: SimulationAgent) {
  if (agent.transfer) {
    return {
      x: agent.transfer.finalX,
      y: agent.transfer.finalY,
      floorId: agent.transfer.floorId,
    };
  }

  return { x: agent.targetX, y: agent.targetY, floorId: agent.floorId };
}

/**
 * Point every walker at the leg they should be walking.
 *
 * Run after decisions, and again when someone steps off a connector, because
 * both are moments at which the floor a person is on and the floor they are
 * heading for can disagree.
 *
 * Somebody whose destination cannot be reached from where they stand — no
 * connector goes that way — is sent to an exit on their own floor instead of
 * being left to walk at a wall. If their own floor has no exit either, they
 * keep their target: the behaviour backend's no-progress rule then deals with
 * them, and nothing here pretends they arrived.
 */
export function planFloorLegs(
  agents: readonly SimulationAgent[],
  graph: FloorGraph,
  sinks: readonly SimulationSink[],
): SimulationAgent[] {
  return agents.map((agent) => {
    if (isRiding(agent)) {
      return agent;
    }

    const destination = destinationOf(agent);

    if ((destination.floorId ?? null) === (agent.floorId ?? null)) {
      return agent.transfer
        ? {
            ...agent,
            transfer: undefined,
            targetX: destination.x,
            targetY: destination.y,
          }
        : agent;
    }

    const connector = graph.nextConnector(agent, destination);

    if (!connector) {
      const reachable = sinks.filter(
        (sink) => (sink.floorId ?? null) === (agent.floorId ?? null),
      );

      if (reachable.length === 0) {
        return agent;
      }

      const sink = nearestAllowedSink(agent, reachable, agent.exitIds);

      return {
        ...agent,
        transfer: undefined,
        targetSinkId: sink.id,
        targetX: sink.position.x,
        targetY: sink.position.y,
      };
    }

    return {
      ...agent,
      transfer: {
        connectorId: connector.id,
        finalX: destination.x,
        finalY: destination.y,
        floorId: destination.floorId!,
      },
      targetX: connector.fromPoint.x,
      targetY: connector.fromPoint.y,
    };
  });
}

/**
 * How many people a connector can take, second by second.
 *
 * The same rule as an entrance (ADR-0008): width times Weidmann's peak
 * specific flow, with an allowance that never banks more than a second's worth
 * — so a quiet spell does not let a crowd pour on at once. When the allowance
 * runs out people simply wait at the mouth, which is what a queue for an
 * escalator is.
 */
export function createConnectorTraffic(connectors: readonly ConnectorRuntime[]) {
  const allowance = new Map<string, number>();

  return {
    /** Add the second's worth of admissions. Call once per step. */
    replenish(dtSeconds: number) {
      for (const connector of connectors) {
        const perSecond = connector.admitPerSecond;
        allowance.set(
          connector.id,
          Math.min(
            Math.max(1, perSecond),
            (allowance.get(connector.id) ?? 1) + perSecond * dtSeconds,
          ),
        );
      }
    },
    /** Take a place on the connector, or false when it is full this second. */
    board(connectorId: string) {
      const left = allowance.get(connectorId) ?? 1;

      if (left < 1) {
        return false;
      }

      allowance.set(connectorId, left - 1);
      return true;
    },
  };
}

export type ConnectorTraffic = ReturnType<typeof createConnectorTraffic>;

/**
 * Step people on and off connectors.
 *
 * Someone who has reached the mouth of the connector they are crossing steps
 * on if there is room, and is then held until the flight's travel time has
 * passed. Someone whose time is up steps off at the far end, on the floor the
 * connector leads to, and is given their next leg.
 */
export function stepConnectorTravel({
  agents,
  connectors,
  elapsedSeconds,
  graph,
  sinks,
  traffic,
}: {
  agents: readonly SimulationAgent[];
  connectors: readonly ConnectorRuntime[];
  elapsedSeconds: number;
  graph: FloorGraph;
  sinks: readonly SimulationSink[];
  traffic: ConnectorTraffic;
}): SimulationAgent[] {
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  const arrived: SimulationAgent[] = [];
  const next = agents.map((agent) => {
    if (isRiding(agent)) {
      if (elapsedSeconds < agent.ridingUntilSeconds!) {
        return agent;
      }

      const connector = byId.get(agent.transfer?.connectorId ?? "");

      if (!connector) {
        // The connector was edited away mid-journey: step off where they are.
        return { ...agent, ridingUntilSeconds: undefined, transfer: undefined };
      }

      const stepped: SimulationAgent = {
        ...agent,
        floorId: connector.toFloorId,
        ridingUntilSeconds: undefined,
        vx: 0,
        vy: 0,
        x: connector.toPoint.x,
        y: connector.toPoint.y,
      };

      arrived.push(stepped);
      return stepped;
    }

    if (!agent.transfer) {
      return agent;
    }

    const connector = byId.get(agent.transfer.connectorId);

    if (!connector || connector.fromFloorId !== agent.floorId) {
      return agent;
    }

    const dx = connector.fromPoint.x - agent.x;
    const dy = connector.fromPoint.y - agent.y;

    if (Math.sqrt(dx * dx + dy * dy) > boardingRadiusMeters) {
      return agent;
    }

    if (!traffic.board(connector.id)) {
      return agent;
    }

    return {
      ...agent,
      // A slower person is longer on the flight, which is the whole point of
      // drawing them from a population (ADR-0011).
      ridingUntilSeconds: elapsedSeconds + personTravelSeconds(connector, agent),
      vx: 0,
      vy: 0,
      x: connector.fromPoint.x,
      y: connector.fromPoint.y,
    };
  });

  // Only those who just stepped off need a new leg; everyone else's is current.
  return arrived.length === 0
    ? next
    : next.map((agent) =>
        arrived.includes(agent) ? planFloorLegs([agent], graph, sinks)[0] : agent,
      );
}
