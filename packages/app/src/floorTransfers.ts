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
import { weidmannMaxSpecificFlowDensityPerSquareMeter } from "./pedestrianFundamentalDiagram";

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
 * How full a flight lane can get before it stops admitting anyone else.
 *
 * `ConnectorTraffic.board` alone is not enough: it rate-limits *admission*,
 * not the lane's own occupancy, so when the lane's downstream flow is slower
 * than its admission rate — which congestion on the lane itself causes,
 * since a crowded flight is a slower one — admission keeps letting more on
 * while fewer come off, and occupancy climbs without bound. Found building
 * RiMEA test 8: a whole floor's population (152) funnelling onto one 2 m
 * stair at once packed a 16 m² flight to 5.8 P/m² — more people than the
 * physical space this project's own geometry says can fit — and it never
 * unstuck; everyone on it sat at near-zero velocity for the rest of the run.
 *
 * The ceiling is `weidmannMaxSpecificFlowDensityPerSquareMeter` (~1.75
 * P/m²), not the jam density (5.4): jam density is where the curve has
 * *already* fallen to zero speed, so capping there reproduces the same
 * gridlock one density lower. The max-flow density is where throughput
 * actually peaks — the most people a lane can be moving through it at once,
 * not the most that can be motionlessly packed into it. This makes the
 * stated design ("someone who can't get up waits at the mouth" — this
 * project's own multi-floor ADR) actually hold at scale, rather than only at
 * the modest headcounts tests 2/3/13 happened to try it at.
 */
function flightCapacity(connector: ConnectorRuntime): number {
  return (
    connector.width *
    flightLengthMeters(connector) *
    weidmannMaxSpecificFlowDensityPerSquareMeter
  );
}

/**
 * Deterministic scatter across a flight's width, keyed by id: the same golden-
 * angle technique `crowdMovement` uses to separate two people who land on the
 * exact same point. Several people can board the same connector on the same
 * step, and starting them all on its centreline would have them shove each
 * other off it in the first tick rather than simply arrive side by side.
 *
 * Also used as each rider's own *target* Y for the far mouth (below), for
 * the same reason in reverse: everyone converging on one shared exit point
 * is what let a crowd jam solid there. A rider keeps to the same lateral
 * offset all the way across.
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
  // How many are already on each flight, so `flightCapacity` can be
  // enforced as people board — mutated below as this step admits more, the
  // same running-tally shape `traffic` itself already uses.
  const occupancy = new Map<string, number>();
  for (const agent of agents) {
    if (agent.floorId !== undefined && agent.floorId.startsWith("flight:")) {
      occupancy.set(agent.floorId, (occupancy.get(agent.floorId) ?? 0) + 1);
    }
  }
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

      // Whether someone has crossed the flight is a question about its
      // length (x), not its width (y): being jostled a little off their own
      // lateral aim point is not "still on the stairs". Checking full 2D
      // distance to `targetY` as well — as this used to — meant someone
      // whose neighbours had nudged them sideways in transit could arrive at
      // the far end already past it in x and still never count as arrived,
      // stuck against the flight's own far wall with the rest of a crowd
      // behind them equally unable to correct their own drift once nothing
      // was moving. Found building RiMEA test 8, downstream of the same
      // jam this file's `flightCapacity`/lateral-target fix addresses:
      // together they stopped the pile-up, but a handful of already-drifted
      // riders still could not close a y-gap with everyone stopped around
      // them.
      if (agent.targetX - agent.x > arrivalRadiusMeters) {
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

    const flightId = flightFloorId(connector.shaftId);
    const occupied = occupancy.get(flightId) ?? 0;

    if (occupied >= flightCapacity(connector)) {
      return agent; // the flight itself is full — wait at the mouth
    }

    if (!traffic.board(connector.id)) {
      return agent;
    }

    occupancy.set(flightId, occupied + 1);

    return {
      ...agent,
      floorId: flightId,
      // A slower person is longer on the flight, which is the whole point of
      // drawing them from a population (ADR-0011) — but now it falls out of
      // actually walking it slower, not a precomputed duration.
      flightSpeedMetersPerSecond: personFlightSpeedMetersPerSecond(connector, agent),
      vx: 0,
      vy: 0,
      x: 0,
      y: boardingLateralMeters(agent, connector.width),
      targetX: flightLengthMeters(connector),
      // Their own lateral offset again, not the flight's centreline: every
      // rider walking toward the exact same point is what let a crowd jam
      // solid right at the far mouth (found building RiMEA test 8) — each
      // still arriving, at speed, well inside the flight's own capacity, but
      // never quite converging on that one shared pixel once enough of them
      // were converging on it together. A rider who heads for the same
      // lateral spot they boarded at is not shoved off it by everyone else
      // aiming there too.
      targetY: boardingLateralMeters(agent, connector.width),
    };
  });

  // Only those who just stepped off need a new leg; everyone else's is current.
  return arrived.length === 0
    ? next
    : next.map((agent) =>
        arrived.includes(agent) ? planFloorLegs([agent], graph, sinks)[0] : agent,
      );
}
