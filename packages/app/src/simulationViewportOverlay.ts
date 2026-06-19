import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createAgentMindset, type AgentIntent } from "./agentPersona";
import type { SimulationSnapshot } from "./simulationEngine";

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

export type ViewportAgentAnnotation = {
  depth: number;
  icon: string;
  id: number;
  intent: ViewportAgentIntentOverlay["intent"];
  label: string;
  leftPercent: number;
  topPercent: number;
};

export function selectViewportOverlayAgents(
  snapshot?: SimulationSnapshot,
  sharedAgentOverlay?: ViewportAgentOverlayFrame,
) {
  return sharedAgentOverlay && sharedAgentOverlay.agents.length > 0
    ? sharedAgentOverlay.agents
    : (snapshot?.agents.slice(0, 240) ?? []);
}

export function selectViewportAgentAnnotations({
  scene,
  sharedAgentOverlay,
  snapshot,
  viewMode,
}: {
  scene: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode: "2d" | "3d";
}): ViewportAgentAnnotation[] {
  const overlayAgents = selectViewportOverlayAgents(snapshot, sharedAgentOverlay);
  const maxAnnotations = viewMode === "3d" ? 96 : 160;
  const stride = Math.max(1, Math.ceil(overlayAgents.length / maxAnnotations));

  return overlayAgents
    .filter((_, index) => index % stride === 0)
    .slice(0, maxAnnotations)
    .map((agent) => {
      const intent = selectAgentIntentOverlay(agent, {
        seed: scene.seed,
      });
      const position =
        viewMode === "3d"
          ? projectAgentToPseudoIsometric(agent, scene)
          : projectAgentToTopDown(agent, scene);

      return {
        depth: position.depth,
        icon: intent.icon,
        id: agent.id,
        intent: intent.intent,
        label: intent.label,
        leftPercent: position.leftPercent,
        topPercent: position.topPercent,
      };
    })
    .sort((left, right) => left.depth - right.depth);
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
    return { icon: "Q", intent: "queue", label: "Queueing" };
  }

  if (agent.lifecycleState === "service") {
    return { icon: "S", intent: "service", label: "In service" };
  }

  if (agent.lifecycleState === "leave" || agent.targetSinkId) {
    return { icon: ">", intent: "goToExit", label: "Leaving" };
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
    return { icon: "A", intent: "avoidCrowd", label: "Avoiding crowd" };
  }

  if (mindset.currentIntent === "browseFashion") {
    return { icon: "$", intent: "browseFashion", label: "Browsing" };
  }

  if (mindset.currentIntent === "buyCoffee") {
    return { icon: "C", intent: "buyCoffee", label: "Coffee" };
  }

  if (mindset.currentIntent === "eatMeal") {
    return { icon: "F", intent: "eatMeal", label: "Dining" };
  }

  if (mindset.currentIntent === "evacuate") {
    return { icon: "!", intent: "evacuate", label: "Evacuating" };
  }

  if (mindset.currentIntent === "goToExit") {
    return { icon: ">", intent: "goToExit", label: "Going to exit" };
  }

  if (mindset.currentIntent === "meetCompanion") {
    return { icon: "M", intent: "meetCompanion", label: "Meeting" };
  }

  return { icon: "i", intent: "seekService", label: "Seeking service" };
}

function projectAgentToTopDown(agent: { x: number; y: number }, scene: CrowdSimScene) {
  return {
    depth: clamp01(agent.y / scene.world.height),
    leftPercent: toPercent(agent.x, scene.world.width),
    topPercent: toPercent(agent.y, scene.world.height),
  };
}

function projectAgentToPseudoIsometric(
  agent: { x: number; y: number },
  scene: CrowdSimScene,
) {
  const normalizedX = agent.x / scene.world.width - 0.5;
  const normalizedY = agent.y / scene.world.height - 0.5;

  return {
    depth: clamp01(
      (agent.y + agent.x * 0.18) / (scene.world.height + scene.world.width * 0.18),
    ),
    leftPercent: clampPercent(50 + normalizedX * 58 + normalizedY * 18),
    topPercent: clampPercent(54 + normalizedY * 32 - normalizedX * 10),
  };
}

function toPercent(value: number, max: number) {
  if (!Number.isFinite(value) || max <= 0) {
    return 0;
  }

  return clampPercent((value / max) * 100);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(4, Math.min(96, value));
}
