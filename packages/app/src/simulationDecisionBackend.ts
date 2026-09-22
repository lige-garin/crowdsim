import type { ScenePoint } from "@crowdsim/scene-schema";
import type { FloorPlace } from "./floorRouting";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

export type SimulationDecisionBackendId = "rule-ts" | "wasm-ready";

export type SimulationAgentDecisionState =
  | "browse"
  | "checkout"
  | "enterStore"
  | "evacuate"
  | "leave"
  | "queue"
  | "walk";

export type SimulationShop = {
  id: string;
  /** The floor it is on; absent in a scene with one floor. */
  floorId?: string;
  position: ScenePoint;
  /** Arrival radius: the agent counts as "at the shop" within this distance. */
  radius: number;
  /** Relative draw used to weight which shop an agent picks. */
  attraction: number;
  /** How long the agent dwells (browses) once it arrives, in seconds. */
  dwellSeconds: number;
  /** Max simultaneous browsers; arrivals beyond this queue instead of entering. */
  capacity: number;
  /** Where the head of the line stands. */
  queuePosition: ScenePoint;
  /** Unit direction the line grows in from `queuePosition`; +y when absent. */
  queueDirection?: ScenePoint;
  /**
   * The shop floor browsers spread over: centre and half extents, already inset
   * from the walls. Browsers stand at `position` when absent.
   */
  browseArea?: { x: number; y: number; halfWidth: number; halfHeight: number };
  /** Probability a browser buys (and so heads to checkout) after browsing. */
  conversionRate: number;
};

export type SimulationServicePoint = {
  id: string;
  /** The floor it is on; absent in a scene with one floor. */
  floorId?: string;
  position: ScenePoint;
  /** Arrival radius: the agent counts as "at the checkout" within this distance. */
  radius: number;
  /** How long a checkout takes once served, in seconds. */
  serviceSeconds: number;
  /** People served at once; absent means no limit. */
  servers?: number;
};

export type SimulationAgentWalkProgress = {
  /** Smallest distance to the walk target reached so far. */
  distance: number;
  /** Decision tick at which `distance` was last improved. */
  tick: number;
};

export type SimulationAgentDecision = {
  agentId: number;
  nextState: SimulationAgentDecisionState;
  selectedStoreId?: string;
  /** Clears the field when explicitly null (e.g. on leaving a shop). */
  browseUntilSeconds?: number | null;
  /** Clears the field when explicitly null (e.g. on leaving a queue). */
  queueUntilSeconds?: number | null;
  /** When the shopper joined the line; clears when explicitly null. */
  queueJoinedSeconds?: number | null;
  /** The checkout counter the buyer is using; clears when explicitly null. */
  servicePointId?: string | null;
  /** Clears the field when explicitly null (e.g. when the target changes). */
  walkProgress?: SimulationAgentWalkProgress | null;
  target?: ScenePoint;
  /** The floor the target is on, when it is not the walker's own. */
  targetFloorId?: string;
  targetSinkId?: string;
};

export type SimulationDecisionTickInput = {
  agents: readonly SimulationAgent[];
  decisionTick: number;
  elapsedSeconds: number;
  sinks: readonly SimulationSink[];
  shops?: readonly SimulationShop[];
  servicePoints?: readonly SimulationServicePoint[];
  /** When true, all agents abandon shopping and head for an exit. */
  evacuationActive?: boolean;
  /**
   * Elapsed time at which evacuation was raised. Pre-movement times are
   * measured from here: someone who has been shopping for ten minutes does
   * not react from the moment the run began.
   */
  evacuationStartedSeconds?: number;
  /**
   * Walking distance around walls. Progress toward a target is measured with
   * it, so a shopper detouring round a building is not mistaken for one stuck
   * against a wall. Straight-line distance when absent.
   */
  routeDistance?: (from: FloorPlace, to: FloorPlace) => number;
};

export type SimulationDecisionBackend = {
  decisionHz: number;
  dispose?: () => void;
  id: SimulationDecisionBackendId;
  decideAgents: (
    input: SimulationDecisionTickInput,
  ) => readonly SimulationAgentDecision[];
};

/** A thing's position as the router wants it: the point and its floor. */
export function placeOf(entity: {
  position: ScenePoint;
  floorId?: string;
}): FloorPlace {
  return { ...entity.position, floorId: entity.floorId };
}

/**
 * The exit an agent should head for: the nearest of the exits its entrance
 * allows (ADR-0008), or the nearest of all when it allows none that exist.
 */
export function nearestAllowedSink(
  point: ScenePoint,
  sinks: readonly SimulationSink[],
  exitIds?: readonly string[],
): SimulationSink {
  const allowed =
    exitIds && exitIds.length > 0
      ? sinks.filter((sink) => exitIds.includes(sink.id))
      : [];
  return nearest(point, allowed.length > 0 ? allowed : sinks);
}

/**
 * The exit with the shortest **walk**, which across floors includes getting
 * down to it. Falls back to the nearest in a straight line when there is no
 * router — the same answer as before floors existed, in a scene with one.
 */
export function nearestSinkByRoute(
  agent: SimulationAgent,
  sinks: readonly SimulationSink[],
  exitIds: readonly string[] | undefined,
  routeDistance?: (from: FloorPlace, to: FloorPlace) => number,
): SimulationSink {
  if (!routeDistance) {
    return nearestAllowedSink(agent, sinks, exitIds);
  }

  const allowed =
    exitIds && exitIds.length > 0
      ? sinks.filter((sink) => exitIds.includes(sink.id))
      : [];
  const candidates = allowed.length > 0 ? allowed : sinks;
  let best = candidates[0];
  let bestCost = Number.POSITIVE_INFINITY;

  for (const sink of candidates) {
    const cost = routeDistance(agent, placeOf(sink));

    if (cost < bestCost) {
      bestCost = cost;
      best = sink;
    }
  }

  // Every exit cut off from where they stand: fall back rather than return
  // nothing, and let the engine's no-progress rule take it from there.
  return Number.isFinite(bestCost) ? best : nearestAllowedSink(agent, sinks, exitIds);
}

/** The candidate whose position is closest to `point`. */
export function nearest<T extends { position: ScenePoint }>(
  point: ScenePoint,
  candidates: readonly T[],
): T {
  let best = candidates[0];
  let bestSq = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const sq =
      (candidate.position.x - point.x) ** 2 + (candidate.position.y - point.y) ** 2;
    if (sq < bestSq) {
      best = candidate;
      bestSq = sq;
    }
  }
  return best;
}

export function shouldRunDecisionTick(options: {
  decisionHz: number;
  movementHz: number;
  nextStepCount: number;
}) {
  const stepsPerDecision = Math.max(
    1,
    Math.round(options.movementHz / options.decisionHz),
  );

  return options.nextStepCount > 0 && options.nextStepCount % stepsPerDecision === 0;
}

export function calculateSimulationDecisionTick(options: {
  decisionHz: number;
  movementHz: number;
  stepCount: number;
}) {
  const stepsPerDecision = Math.max(
    1,
    Math.round(options.movementHz / options.decisionHz),
  );

  return Math.floor(Math.max(0, options.stepCount) / stepsPerDecision);
}

export function applySimulationAgentDecisions(
  agents: readonly SimulationAgent[],
  decisions: readonly SimulationAgentDecision[],
  decisionTick: number,
) {
  if (decisions.length === 0) {
    return agents.map((agent) => ({ ...agent }));
  }

  const decisionsByAgentId = new Map(
    decisions.map((decision) => [decision.agentId, decision]),
  );

  return agents.map((agent) => {
    const decision = decisionsByAgentId.get(agent.id);

    if (!decision) {
      return { ...agent };
    }

    const target = decision.target ?? {
      x: agent.targetX,
      y: agent.targetY,
    };

    return {
      ...agent,
      decisionTick,
      lifecycleState: decision.nextState,
      selectedStoreId: decision.selectedStoreId,
      browseUntilSeconds:
        decision.browseUntilSeconds === null
          ? undefined
          : (decision.browseUntilSeconds ?? agent.browseUntilSeconds),
      queueUntilSeconds:
        decision.queueUntilSeconds === null
          ? undefined
          : (decision.queueUntilSeconds ?? agent.queueUntilSeconds),
      queueJoinedSeconds:
        decision.queueJoinedSeconds === null
          ? undefined
          : (decision.queueJoinedSeconds ?? agent.queueJoinedSeconds),
      servicePointId:
        decision.servicePointId === null
          ? undefined
          : (decision.servicePointId ?? agent.servicePointId),
      walkProgress:
        decision.walkProgress === null
          ? undefined
          : (decision.walkProgress ?? agent.walkProgress),
      targetSinkId: decision.targetSinkId ?? agent.targetSinkId,
      ...(decision.target === undefined
        ? {}
        : targetFloorFields(agent, target, decision.targetFloorId)),
      targetX: target.x,
      targetY: target.y,
    };
  });
}

/**
 * Where a decision's target sits relative to the walker: on their floor, or on
 * another one they will have to cross to. Recorded as a transfer with no
 * connector yet — the engine picks that, because only it knows the ways
 * between floors. A decision with no floor on it means "here", which is what
 * every one-floor scene says.
 */
function targetFloorFields(
  agent: SimulationAgent,
  target: ScenePoint,
  targetFloorId?: string,
) {
  // No floor on the decision means the target is where the walker already is.
  // Reading it as "another floor" invented a transfer to an undefined floor —
  // which no connector leads to, so planFloorLegs sent the walker to an exit
  // instead of where they had just been told to go. Every decision backend
  // that does not know about floors, and every one that does but leaves a
  // same-floor target unlabelled, depends on this.
  if (targetFloorId === undefined || targetFloorId === agent.floorId) {
    return { transfer: undefined };
  }

  return {
    transfer: {
      connectorId: agent.transfer?.connectorId ?? "",
      finalX: target.x,
      finalY: target.y,
      floorId: targetFloorId!,
    },
  };
}
