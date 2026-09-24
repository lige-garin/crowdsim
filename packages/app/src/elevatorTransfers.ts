import {
  defaultElevatorCapacity,
  defaultElevatorDoorSeconds,
  elevatorCarFloorId,
  elevatorCarSideMeters,
  elevatorRideSeconds,
  type ConnectorRuntime,
  type FloorGraph,
} from "./floorRouting";
import { boardingRadiusMeters, isRiding, planFloorLegs } from "./floorTransfers";
import type { ScenePoint } from "@crowdsim/scene-schema";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

/**
 * A lift's cars (ADR-0010 stage 6; continuous boarding and multi-car load
 * balancing added in ADR-0029): a queue with a batch service, not a
 * walkable lane — people wait at a hall point, a car with room opens its
 * doors, some number board, it travels, they get out.
 *
 * **The dispatch is the simplest rule that is still a rule.** Every idle
 * car already at the calling floor answers it for free, and a car already
 * boarding keeps accepting new arrivals until its own doors close, not just
 * whoever was there the instant it started (ADR-0029) — so a queue larger
 * than one car's capacity spreads across every idle car at that floor
 * before anyone is left waiting. Otherwise, enough idle cars (by
 * `carCount` order) still at the other floor are sent to cover the
 * remaining queue there, one per `capacity`'s worth of people
 * (ADR-0029) — not just one car regardless of how many are waiting. On a
 * shaft with only two floors that is the whole of "nearest idle car" —
 * every idle car not already at the calling floor is equally near it, there
 * being only the one other floor to be near from — and it still does not
 * look ahead the way a real controller does (predicting who else is worth
 * picking up along the way at a floor it merely passes), because a
 * two-floor shaft has no floor to pass by unpicked. A three-floor bank is
 * not one car skipping a floor either: it is declared as two independent
 * shafts (`connectorSchema`'s own doc comment), each run by this same
 * two-floor rule.
 */

export type ElevatorCarPhase = "idle" | "boarding" | "moving";

export type ElevatorCarRuntime = {
  shaftId: string;
  carIndex: number;
  phase: ElevatorCarPhase;
  /** The floor the car is sitting at (idle, or open for boarding). */
  atFloorId: string;
  /** Set only while moving: the floor it is headed to. */
  headingToFloorId?: string;
  /** Sim-time seconds (`elapsedSeconds`) at which the current phase ends. */
  readyAtSeconds: number;
  /** Agent ids aboard right now. */
  passengers: number[];
};

/** One shaft's fixed two floors and shared configuration — read once from
 * whichever of its two directional runtime entries is seen first, since
 * `sceneConnectorRuntimes` puts the same capacity/carCount/doorSeconds on
 * both. */
type ShaftInfo = {
  floors: readonly [string, string];
  /** Where the car door opens on each of the shaft's two floors. */
  mouths: ReadonlyMap<string, ScenePoint>;
  capacity: number;
  doorSeconds: number;
  rideSeconds: number;
};

function collectShafts(
  elevatorConnectors: readonly ConnectorRuntime[],
): Map<string, ShaftInfo> {
  const shafts = new Map<string, ShaftInfo>();

  for (const connector of elevatorConnectors) {
    if (shafts.has(connector.shaftId)) {
      continue;
    }

    const mouths = new Map<string, ScenePoint>();
    for (const entry of elevatorConnectors) {
      if (entry.shaftId === connector.shaftId) {
        mouths.set(entry.fromFloorId, entry.fromPoint);
      }
    }

    shafts.set(connector.shaftId, {
      capacity: connector.capacity ?? defaultElevatorCapacity,
      doorSeconds: connector.doorSeconds ?? defaultElevatorDoorSeconds,
      floors: [connector.fromFloorId, connector.toFloorId],
      mouths,
      rideSeconds: elevatorRideSeconds(connector),
    });
  }

  return shafts;
}

/** A car's deterministic resting spot inside its own box, spread by agent id
 * (the same golden-angle scatter `floorTransfers.boardingLateralMeters` uses
 * for a flight's width, in two dimensions here since a car's floor is a
 * square, not a corridor). */
function carRestingPosition(agentId: number, sideMeters: number): ScenePoint {
  const center = sideMeters / 2;
  const radius = center * 0.5;
  const angle = agentId * 2.399963;
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}

/** Every shaft's cars, idle at their `from` floor, doors closed. Rebuilt
 * whenever the scene's connectors change (`simulationEngine.replaceGeometry`)
 * — a hot edit resets who is where mid-ride the same way it already resets
 * `connectorTraffic`'s allowances. */
export function createElevatorRuntime(
  connectors: readonly ConnectorRuntime[],
): Map<string, ElevatorCarRuntime[]> {
  const shafts = collectShafts(connectors.filter((c) => c.kind === "elevator"));
  const cars = new Map<string, ElevatorCarRuntime[]>();

  for (const [shaftId, info] of shafts) {
    const carCount = connectors.find((c) => c.shaftId === shaftId)?.carCount ?? 1;

    cars.set(
      shaftId,
      Array.from({ length: carCount }, (_, carIndex) => ({
        atFloorId: info.floors[0],
        carIndex,
        passengers: [],
        phase: "idle" as const,
        readyAtSeconds: 0,
        shaftId,
      })),
    );
  }

  return cars;
}

/**
 * Step every lift shaft one tick: advance cars whose door or travel time has
 * elapsed, board and alight passengers, and dispatch idle cars to a waiting
 * call. Mutates `cars` in place (the same kind of long-lived engine state
 * `floorTransfers.createConnectorTraffic`'s allowance map already is) and
 * returns the agents array with anyone who boarded, alighted, or is still
 * riding updated.
 */
export function stepElevatorTravel({
  agents,
  cars,
  connectors,
  graph,
  nowSeconds,
  sinks,
}: {
  agents: readonly SimulationAgent[];
  cars: Map<string, ElevatorCarRuntime[]>;
  connectors: readonly ConnectorRuntime[];
  graph: FloorGraph;
  nowSeconds: number;
  sinks: readonly SimulationSink[];
}): SimulationAgent[] {
  const elevatorConnectors = connectors.filter((c) => c.kind === "elevator");

  if (elevatorConnectors.length === 0) {
    return agents as SimulationAgent[];
  }

  const shafts = collectShafts(elevatorConnectors);
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const updates = new Map<number, SimulationAgent>();
  const boardedThisTick = new Set<number>();

  for (const [shaftId, info] of shafts) {
    const shaftCars = cars.get(shaftId) ?? [];
    const side = elevatorCarSideMeters(info.capacity);
    const otherFloor = (floorId: string) =>
      floorId === info.floors[0] ? info.floors[1] : info.floors[0];

    const waitingByFloor = new Map<string, SimulationAgent[]>();
    for (const agent of agents) {
      if (
        agent.transfer?.shaftId !== shaftId ||
        isRiding(agent) ||
        agent.floorId === undefined
      ) {
        continue;
      }
      const mouth = info.mouths.get(agent.floorId);
      if (!mouth) {
        continue;
      }
      const dx = mouth.x - agent.x;
      const dy = mouth.y - agent.y;
      if (Math.sqrt(dx * dx + dy * dy) > boardingRadiusMeters) {
        continue;
      }
      const list = waitingByFloor.get(agent.floorId) ?? [];
      list.push(agent);
      waitingByFloor.set(agent.floorId, list);
    }

    /** Board up to capacity from whoever is waiting at `floorId` and not
     * already claimed this tick. Returns whether anyone actually boarded. */
    function board(car: ElevatorCarRuntime, floorId: string): boolean {
      const waiting = (waitingByFloor.get(floorId) ?? []).filter(
        (agent) => !boardedThisTick.has(agent.id),
      );
      const room = info.capacity - car.passengers.length;
      const boarding = waiting.slice(0, Math.max(0, room));

      for (const agent of boarding) {
        boardedThisTick.add(agent.id);
        car.passengers.push(agent.id);
        const rest = carRestingPosition(agent.id, side);
        updates.set(agent.id, {
          ...agent,
          floorId: elevatorCarFloorId(shaftId, car.carIndex),
          targetX: rest.x,
          targetY: rest.y,
          vx: 0,
          vy: 0,
          x: rest.x,
          y: rest.y,
        });
      }

      return boarding.length > 0;
    }

    // Pass 0: a car already boarding keeps its doors' own open window
    // working for it — anyone who reaches the hall point before
    // `readyAtSeconds` boards the car that is already loading rather than
    // being left for its next trip (ADR-0029; doorSeconds itself is
    // unchanged, only who gets to use that same window).
    for (const car of shaftCars) {
      if (car.phase === "boarding" && nowSeconds < car.readyAtSeconds) {
        board(car, car.atFloorId);
      }
    }

    // Pass 1: finish whatever phase each car is already in.
    for (const car of shaftCars) {
      if (car.phase === "idle" || nowSeconds < car.readyAtSeconds) {
        continue;
      }

      if (car.phase === "boarding") {
        if (car.passengers.length > 0) {
          car.phase = "moving";
          car.headingToFloorId = otherFloor(car.atFloorId);
          car.readyAtSeconds = nowSeconds + info.rideSeconds;
        } else {
          car.phase = "idle";
        }
        continue;
      }

      // moving -> arrived: alight everyone aboard, then look for a return trip.
      const arrivedFloorId = car.headingToFloorId!;
      car.atFloorId = arrivedFloorId;
      car.headingToFloorId = undefined;
      const mouth = info.mouths.get(arrivedFloorId)!;

      for (const agentId of car.passengers) {
        const agent = updates.get(agentId) ?? byId.get(agentId);
        if (!agent) {
          continue;
        }
        const alighted: SimulationAgent = {
          ...agent,
          floorId: arrivedFloorId,
          vx: 0,
          vy: 0,
          x: mouth.x,
          y: mouth.y,
        };
        updates.set(agentId, planFloorLegs([alighted], graph, sinks)[0]);
      }
      car.passengers = [];

      if (board(car, arrivedFloorId)) {
        car.phase = "boarding";
        car.readyAtSeconds = nowSeconds + info.doorSeconds;
      } else {
        car.phase = "idle";
      }
    }

    // Pass 2: every idle car already at a floor with a call answers it —
    // free, no travel needed. Not just the first: `board()` re-reads the
    // floor's own waiting list net of `boardedThisTick`, so a second idle
    // car at the same floor naturally picks up whatever the first could
    // not fit (ADR-0029's load-balancing half), with no extra bookkeeping.
    for (const car of shaftCars) {
      if (car.phase !== "idle") {
        continue;
      }
      if (board(car, car.atFloorId)) {
        car.phase = "boarding";
        car.readyAtSeconds = nowSeconds + info.doorSeconds;
      }
    }

    // Pass 3: send enough of whichever idle cars remain to cover a call at
    // the other floor — not just one, if the queue there outgrows a single
    // car's capacity and more than one idle car is free to help
    // (ADR-0029). This is still not floor-passing lookahead: a shaft is
    // always exactly two floors (this module's own doc comment), so
    // "nearest idle car" is every idle car not already there.
    for (const floorId of info.floors) {
      const stillWaiting = (waitingByFloor.get(floorId) ?? []).filter(
        (agent) => !boardedThisTick.has(agent.id),
      );
      if (stillWaiting.length === 0) {
        continue;
      }
      const carsNeeded = Math.ceil(stillWaiting.length / info.capacity);
      let dispatched = 0;
      for (const car of shaftCars) {
        if (dispatched >= carsNeeded) {
          break;
        }
        if (car.phase !== "idle") {
          continue;
        }
        car.phase = "moving";
        car.headingToFloorId = floorId;
        car.readyAtSeconds = nowSeconds + info.rideSeconds;
        dispatched++;
      }
    }
  }

  return agents.map((agent) => updates.get(agent.id) ?? agent);
}
