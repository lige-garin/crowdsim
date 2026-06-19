import type { SimulationSnapshot } from "./simulationEngine";
import { createAgentMindset, type AgentIntent } from "./agentPersona";

export type ViewportAgentOverlayFrame = {
  agents: Array<{
    id: number;
    x: number;
    y: number;
  }>;
  capacity: number;
};

export type ViewportAgentIntentOverlay = {
  icon: string;
  intent: AgentIntent | "queue" | "service";
  label: string;
};

export function selectViewportOverlayAgents(
  snapshot?: SimulationSnapshot,
  sharedAgentOverlay?: ViewportAgentOverlayFrame,
) {
  return sharedAgentOverlay && sharedAgentOverlay.agents.length > 0
    ? sharedAgentOverlay.agents
    : (snapshot?.agents.slice(0, 240) ?? []);
}

export function selectAgentIntentOverlay(
  agent: {
    id: number;
    lifecycleState?: string;
    selectedStoreId?: string;
    targetSinkId?: string;
  },
  options: {
    evacuationActive?: boolean;
    seed: number;
  },
): ViewportAgentIntentOverlay {
  if (agent.lifecycleState === "queue") {
    return { icon: "⌛", intent: "queue", label: "Queueing" };
  }

  if (agent.lifecycleState === "service") {
    return { icon: "✓", intent: "service", label: "In service" };
  }

  if (agent.lifecycleState === "leave" || agent.targetSinkId) {
    return { icon: "↗", intent: "goToExit", label: "Leaving" };
  }

  if (agent.lifecycleState === "evacuate" || options.evacuationActive) {
    return { icon: "!", intent: "evacuate", label: "Evacuating" };
  }

  if (agent.selectedStoreId) {
    return { icon: "$", intent: "browseFashion", label: "Shopping" };
  }

  return intentIcon(createAgentMindset({ agentId: agent.id, seed: options.seed }));
}

function intentIcon(mindset: {
  currentIntent: AgentIntent;
}): ViewportAgentIntentOverlay {
  if (mindset.currentIntent === "avoidCrowd") {
    return { icon: "↘", intent: "avoidCrowd", label: "Avoiding crowd" };
  }

  if (mindset.currentIntent === "browseFashion") {
    return { icon: "$", intent: "browseFashion", label: "Browsing" };
  }

  if (mindset.currentIntent === "buyCoffee") {
    return { icon: "☕", intent: "buyCoffee", label: "Coffee" };
  }

  if (mindset.currentIntent === "eatMeal") {
    return { icon: "🍽", intent: "eatMeal", label: "Dining" };
  }

  if (mindset.currentIntent === "evacuate") {
    return { icon: "!", intent: "evacuate", label: "Evacuating" };
  }

  if (mindset.currentIntent === "goToExit") {
    return { icon: "↗", intent: "goToExit", label: "Going to exit" };
  }

  if (mindset.currentIntent === "meetCompanion") {
    return { icon: "◎", intent: "meetCompanion", label: "Meeting" };
  }

  return { icon: "i", intent: "seekService", label: "Seeking service" };
}
