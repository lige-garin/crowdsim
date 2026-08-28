import type { ScenePoint } from "@crowdsim/scene-schema";
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
  position: ScenePoint;
  /** Arrival radius: the agent counts as "at the shop" within this distance. */
  radius: number;
  /** Relative draw used to weight which shop an agent picks. */
  attraction: number;
  /** How long the agent dwells (browses) once it arrives, in seconds. */
  dwellSeconds: number;
  /** Max simultaneous browsers; arrivals beyond this queue instead of entering. */
  capacity: number;
  /** Where queued shoppers wait for a free slot. */
  queuePosition: ScenePoint;
  /** Probability a browser buys (and so heads to checkout) after browsing. */
  conversionRate: number;
};

export type SimulationServicePoint = {
  id: string;
  position: ScenePoint;
  /** Arrival radius: the agent counts as "at the checkout" within this distance. */
  radius: number;
  /** How long a checkout takes once served, in seconds. */
  serviceSeconds: number;
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
  /** Clears the field when explicitly null (e.g. when the target changes). */
  walkProgress?: SimulationAgentWalkProgress | null;
  target?: ScenePoint;
  targetSinkId?: string;
};

export type SimulationDecisionTickInput = {
  agents: readonly SimulationAgent[];
  decisionTick: number;
  elapsedSeconds: number;
  sinks: readonly SimulationSink[];
  shops?: readonly SimulationShop[];
  servicePoints?: readonly SimulationServicePoint[];
  /** When true, all agents abandon shopping and head for the nearest exit. */
  evacuationActive?: boolean;
};

export type SimulationDecisionBackend = {
  decisionHz: number;
  dispose?: () => void;
  id: SimulationDecisionBackendId;
  decideAgents: (
    input: SimulationDecisionTickInput,
  ) => readonly SimulationAgentDecision[];
};

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
      walkProgress:
        decision.walkProgress === null
          ? undefined
          : (decision.walkProgress ?? agent.walkProgress),
      targetSinkId: decision.targetSinkId ?? agent.targetSinkId,
      targetX: target.x,
      targetY: target.y,
    };
  });
}
