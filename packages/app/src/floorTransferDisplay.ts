import type { ElevatorCarRuntime } from "./elevatorTransfers";
import { isRiding } from "./floorTransfers";
import { flightLengthMeters, type ConnectorRuntime } from "./floorRouting";
import type { SimulationAgent } from "./simulationEngine";

export type RiderDisplayPosition = { floorId: string; x: number; y: number };

/**
 * Where to show someone mid-flight — riding a stair/escalator lane or an
 * elevator car — on a REAL floor, since neither is one (ADR-0010 stage 5/6's
 * disclosed display gap: `selectCrowdAgents`/the heatmap/`runAnalytics` only
 * know real floor ids, and a flight's own coordinate system is not any real
 * floor's). Undefined for anyone not mid-flight, meaning "use their own
 * floorId/x/y unchanged".
 *
 * Stair/escalator: past the lane's own midpoint switches from the departure
 * floor to the arrival floor, shown at the connector's own door point on
 * that end — an approximation (the real position is somewhere inside the
 * flight's own corridor, which is not either floor's coordinate system), not
 * a lie: which end someone is closer to is a real fact about them, even
 * though the exact metre along the flight is not carried over.
 *
 * Elevator: idle/boarding shows at the floor the car is sitting at; moving
 * shows at the floor it is heading to, since the car has left the floor it
 * came from the moment it starts moving and there is no distance-along-the-
 * shaft value (`ElevatorCarRuntime` times a phase, not a position) to
 * interpolate against.
 */
export function riderDisplayPosition(
  agent: SimulationAgent,
  connectorsById: ReadonlyMap<string, ConnectorRuntime>,
  elevatorCars: ReadonlyMap<string, readonly ElevatorCarRuntime[]>,
): RiderDisplayPosition | undefined {
  if (!isRiding(agent) || agent.transfer === undefined) {
    return undefined;
  }
  const connector = connectorsById.get(agent.transfer.connectorId);
  if (connector === undefined) {
    return undefined;
  }

  if (connector.kind === "elevator") {
    const car = (elevatorCars.get(agent.transfer.shaftId) ?? []).find((candidate) =>
      candidate.passengers.includes(agent.id),
    );
    if (car === undefined) {
      return undefined;
    }
    const targetFloorId =
      car.phase === "moving" ? (car.headingToFloorId ?? car.atFloorId) : car.atFloorId;
    const point =
      targetFloorId === connector.toFloorId ? connector.toPoint : connector.fromPoint;
    return { floorId: targetFloorId, x: point.x, y: point.y };
  }

  const length = flightLengthMeters(connector);
  const progress = agent.x / length;
  return progress < 0.5
    ? {
        floorId: connector.fromFloorId,
        x: connector.fromPoint.x,
        y: connector.fromPoint.y,
      }
    : { floorId: connector.toFloorId, x: connector.toPoint.x, y: connector.toPoint.y };
}

/**
 * `entity.display` when set, otherwise its own floorId/x/y — the one place
 * every consumer of a snapshot's `display` field (the crowd renderer, the
 * shared-memory writer, `runAnalytics`, the heatmap sample collector) reads
 * "where do I actually draw/count this one", so the four of them do not each
 * reimplement the same `display?.field ?? field` fallback.
 */
export function resolveDisplayPosition(entity: {
  floorId?: string;
  x: number;
  y: number;
  display?: RiderDisplayPosition;
}): { floorId?: string; x: number; y: number } {
  return entity.display ?? { floorId: entity.floorId, x: entity.x, y: entity.y };
}
