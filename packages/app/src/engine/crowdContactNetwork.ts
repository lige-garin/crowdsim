import type { SimulationAgent } from "./simulationEngine";

export type CrowdContactNode = {
  id: string;
  label: string;
  /** Lifecycle state (browse / queue / walk / leave / ...) — drives node colour. */
  state: string;
  xPercent: number;
  yPercent: number;
};

export type CrowdContactLink = {
  id: string;
  source: string;
  target: string;
  kind: "sameShop" | "queue" | "proximity";
  strength: number;
};

export type CrowdContactNetwork = {
  nodes: CrowdContactNode[];
  links: CrowdContactLink[];
};

/**
 * Real person-to-person contact network from the live crowd: two shoppers who
 * are within `proximityMeters` of each other count as a contact edge (sharing a
 * shop, queuing together, or just passing close). Replaces the hard-coded
 * hospital demo with something derived from the actual simulation.
 */
export function buildCrowdContactNetwork(
  agents: readonly SimulationAgent[],
  options: {
    worldWidth: number;
    worldHeight: number;
    proximityMeters?: number;
    maxNodes?: number;
  },
): CrowdContactNetwork {
  const proximityMeters = options.proximityMeters ?? 3;
  const maxNodes = options.maxNodes ?? 12;
  const proximitySq = proximityMeters * proximityMeters;

  type Pair = { a: SimulationAgent; b: SimulationAgent; distSq: number };
  const pairs: Pair[] = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i];
      const b = agents[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= proximitySq) {
        pairs.push({ a, b, distSq });
      }
    }
  }

  // Prioritise the most-connected agents so the graph stays readable.
  const contactCount = new Map<number, number>();
  for (const pair of pairs) {
    contactCount.set(pair.a.id, (contactCount.get(pair.a.id) ?? 0) + 1);
    contactCount.set(pair.b.id, (contactCount.get(pair.b.id) ?? 0) + 1);
  }
  const selectedIds = new Set(
    [...contactCount.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, maxNodes)
      .map(([id]) => id),
  );

  const agentById = new Map(agents.map((a) => [a.id, a]));
  const nodes: CrowdContactNode[] = [...selectedIds].map((id) => {
    const a = agentById.get(id)!;
    return {
      id: `agent-${id}`,
      label: `客 #${id}`,
      state: a.lifecycleState ?? "walk",
      xPercent: clampPercent((a.x / options.worldWidth) * 100),
      yPercent: clampPercent((a.y / options.worldHeight) * 100),
    };
  });

  const links: CrowdContactLink[] = [];
  for (const pair of pairs) {
    if (!selectedIds.has(pair.a.id) || !selectedIds.has(pair.b.id)) {
      continue;
    }
    const dist = Math.sqrt(pair.distSq);
    links.push({
      id: `link-${pair.a.id}-${pair.b.id}`,
      source: `agent-${pair.a.id}`,
      target: `agent-${pair.b.id}`,
      kind: contactKind(pair.a, pair.b),
      strength: 1 - Math.min(1, dist / proximityMeters),
    });
  }

  return { nodes, links };
}

function contactKind(a: SimulationAgent, b: SimulationAgent): CrowdContactLink["kind"] {
  if (a.selectedStoreId && a.selectedStoreId === b.selectedStoreId) {
    if (a.lifecycleState === "queue" && b.lifecycleState === "queue") {
      return "queue";
    }
    if (a.lifecycleState === "browse" && b.lifecycleState === "browse") {
      return "sameShop";
    }
  }
  return "proximity";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
