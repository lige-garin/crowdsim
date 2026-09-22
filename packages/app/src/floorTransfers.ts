import {
  flightFloorId,
  flightLengthMeters,
  isOnShaftFlight,
  personFlightSpeedMetersPerSecond,
  type FloorGraph,
  type ConnectorRuntime,
} from "./floorRouting";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import { nearestAllowedSink } from "./simulationDecisionBackend";

/**
 * Crossing between floors (ADR-0010, stages 4–5).
 *
 * A walk to somewhere on another floor is broken into legs: walk to the
 * connector, travel it, walk on. `targetX`/`targetY` always hold **the leg
 * being walked now**, so everything that steers a crowd — the social force,
 * the wall constraint, the queueing — keeps working on one plane and never has
 * to know that floors exist. Where the person is really going is kept in
 * `transfer` until they get to that floor.
 *
 * While travelling a connector a person is on its own flight lane
 * (`floorRouting.buildFlightLane`), not on either real floor: pushed by, and
 * pushing, whoever else is on the same flight, exactly as they would be in a
 * corridor. They are still in the run and still counted, just not on a plane
 * `selectCrowdAgents`/the heatmap/`runAnalytics` know how to draw or bucket —
 * a rider is not shown on either floor while riding, and a per-floor density
 * or count-line report is blind to the flight itself. That is a disclosed
 * simplification of *display*, not of the physics: unlike the timer this
 * replaced, the flight is a real place a crowd can queue and slow down on.
 */

/** How close to a connector's mouth someone must be to step on. */
export const boardingRadiusMeters = 1.2;

/** How close to the far mouth counts as having crossed the flight. */
const arrivalRadiusMeters = 0.15;

/** True while this person is on a connector's own lane, not a real floor —
 * walking a stair or escalator's flight, or standing/riding in a lift car. */
export function isRiding(agent: SimulationAgent): boolean {
  return (
    agent.transfer !== undefined &&
    isOnShaftFlight(agent.floorId, agent.transfer.shaftId)
  );
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
        shaftId: connector.shaftId,
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
 * Deterministic scatter across a flight's width, keyed by id: the same golden-
 * angle technique `crowdMovement` uses to separate two people who land on the
 * exact same point. Several people can board the same connector on the same
 * step, and starting them all on its centreline would have them shove each
 * other off it in the first tick rather than simply arrive side by side.
 */
function boardingLateralMeters(agent: SimulationAgent, width: number) {
  const unit = (Math.sin(agent.id * 2.399963) + 1) / 2; // 0..1
  return width * (0.2 + 0.6 * unit); // stay off the two side walls
}

/**
 * Step people on and off a stair or escalator's flight.
 *
 * Someone who has reached the mouth of the connector they are crossing boards
 * it if there is room, moving onto its own flight lane. From there they are
 * stepped by the ordinary per-floor crowd loop (`simulationEngine`), exactly
 * like anyone on a real floor, until they reach the far mouth — a matter of
 * distance now, not a timer, so someone squeezed by others on the stairs
 * genuinely takes longer, the way a corridor already works. Arriving there
 * puts them on the floor the connector leads to and gives them their next leg.
 *
 * **Never touches a lift connector.** A lift's progress is not "distance to
 * the far mouth" — a car's own door and travel timing decides it
 * (`elevatorTransfers.stepElevatorTravel`), which this function would get
 * wrong by evicting a rider the moment their held position happens to settle
 * near the car's centre. Both the riding and the boarding check below bail
 * out on `kind === "elevator"` before doing anything.
 */
export function stepConnectorTravel({
  agents,
  connectors,
  graph,
  sinks,
  traffic,
}: {
  agents: readonly SimulationAgent[];
  connectors: readonly ConnectorRuntime[];
  graph: FloorGraph;
  sinks: readonly SimulationSink[];
  traffic: ConnectorTraffic;
}): SimulationAgent[] {
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  const arrived: SimulationAgent[] = [];
  const next = agents.map((agent) => {
    if (isRiding(agent)) {
      const connector = byId.get(agent.transfer!.connectorId);

      if (connector?.kind === "elevator") {
        return agent; // elevatorTransfers.stepElevatorTravel owns this rider
      }

      if (!connector) {
        // The connector was edited away mid-flight. simulationEngine's
        // `replaceGeometry` evicts anyone standing on a lane that no longer
        // exists before this ever runs, so in practice this is unreachable —
        // but there is no flight geometry left here to say where they
        // physically were, so the best this can do is land them at the
        // journey's final destination rather than leave them on a lane gone
        // from under them.
        const dest = agent.transfer!;
        const stepped: SimulationAgent = {
          ...agent,
          floorId: dest.floorId,
          flightSpeedMetersPerSecond: undefined,
          transfer: undefined,
          vx: 0,
          vy: 0,
          x: dest.finalX,
          y: dest.finalY,
          targetX: dest.finalX,
          targetY: dest.finalY,
        };
        arrived.push(stepped);
        return stepped;
      }

      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;

      if (Math.sqrt(dx * dx + dy * dy) > arrivalRadiusMeters) {
        return agent; // still on the flight; stepCrowd moved them this step
      }

      const stepped: SimulationAgent = {
        ...agent,
        floorId: connector.toFloorId,
        flightSpeedMetersPerSecond: undefined,
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

    if (
      !connector ||
      connector.kind === "elevator" ||
      connector.fromFloorId !== agent.floorId
    ) {
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
      floorId: flightFloorId(connector.shaftId),
      // A slower person is longer on the flight, which is the whole point of
      // drawing them from a population (ADR-0011) — but now it falls out of
      // actually walking it slower, not a precomputed duration.
      flightSpeedMetersPerSecond: personFlightSpeedMetersPerSecond(connector, agent),
      vx: 0,
      vy: 0,
      x: 0,
      y: boardingLateralMeters(agent, connector.width),
      targetX: flightLengthMeters(connector),
      targetY: connector.width / 2,
    };
  });

  // Only those who just stepped off need a new leg; everyone else's is current.
  return arrived.length === 0
    ? next
    : next.map((agent) =>
        arrived.includes(agent) ? planFloorLegs([agent], graph, sinks)[0] : agent,
      );
}
