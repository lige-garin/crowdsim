import type { AgentMindset } from "./agentPersona";
import type { BrandStoreCandidate } from "./brandAttraction";
import { rankBrandStores } from "./brandAttraction";
import type { EnvironmentImpact } from "./environmentEffects";

export type AgentLifecycleState =
  | "browse"
  | "enterStore"
  | "evacuate"
  | "leave"
  | "queue"
  | "walk";

export type AgentLifecycleDecision = {
  explanation: string[];
  nextState: AgentLifecycleState;
  selectedStoreId?: string;
};

export function decideAgentLifecycleState(options: {
  agent: AgentMindset;
  environment: EnvironmentImpact;
  stores: readonly BrandStoreCandidate[];
  position: { x: number; y: number };
}): AgentLifecycleDecision {
  if (
    options.environment.riskScore >= 0.55 ||
    options.agent.currentIntent === "evacuate"
  ) {
    return {
      explanation: ["risk threshold exceeded"],
      nextState: "evacuate",
    };
  }

  const ranked = rankBrandStores(options.agent, options.stores, {
    agentPosition: options.position,
  });
  const selected = ranked[0];

  if (!selected || selected.probability < 0.25) {
    return {
      explanation: ["no store exceeds entry threshold"],
      nextState: options.agent.traits.timePressure > 0.75 ? "leave" : "walk",
    };
  }

  const queuePressure =
    selected.store.queueLength / Math.max(1, selected.store.brand.capacity);

  if (queuePressure > options.agent.traits.patience) {
    return {
      explanation: ["queue pressure exceeds patience", ...selected.reasons],
      nextState: "browse",
      selectedStoreId: selected.store.id,
    };
  }

  return {
    explanation: selected.reasons,
    nextState: queuePressure > 0.25 ? "queue" : "enterStore",
    selectedStoreId: selected.store.id,
  };
}
