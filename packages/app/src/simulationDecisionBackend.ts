import type { ScenePoint } from "@crowdsim/scene-schema";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

export type SimulationDecisionBackendId = "rule-ts" | "wasm-ready";

export type SimulationAgentDecisionState =
  | "browse"
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
};

export type SimulationAgentDecision = {
  agentId: number;
  nextState: SimulationAgentDecisionState;
  selectedStoreId?: string;
  /** Clears the field when explicitly null (e.g. on leaving a shop). */
  browseUntilSeconds?: number | null;
  target?: ScenePoint;
  targetSinkId?: string;
};

export type SimulationDecisionTickInput = {
  agents: readonly SimulationAgent[];
  decisionTick: number;
  elapsedSeconds: number;
  sinks: readonly SimulationSink[];
  shops?: readonly SimulationShop[];
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
      targetSinkId: decision.targetSinkId ?? agent.targetSinkId,
      targetX: target.x,
      targetY: target.y,
    };
  });
}
