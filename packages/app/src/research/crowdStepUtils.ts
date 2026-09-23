import type { SimulationAgent } from "../simulationEngine";

/**
 * Splits a population into who has already reached their own exit this
 * step and who is still walking — the same up-front filter
 * `stepCrowdOrca` and `stepCrowdMoussaid` both need before doing their own,
 * different per-step work on whoever remains. `stepCrowd`'s own social
 * force keeps this inline in its single hot loop instead (that loop is
 * documented as perf-sensitive enough that even a closure call costs
 * something), so this is shared by the two comparison models only.
 */
export function splitExitedAgents(
  agents: readonly SimulationAgent[],
  isExitBound: (agent: SimulationAgent) => boolean,
  exitRadius: (agent: SimulationAgent) => number,
): { exitedCount: number; remaining: SimulationAgent[] } {
  let exitedCount = 0;
  const remaining: SimulationAgent[] = [];

  for (const agent of agents) {
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (isExitBound(agent) && distance <= exitRadius(agent)) {
      exitedCount++;
      continue;
    }
    remaining.push(agent);
  }

  return { exitedCount, remaining };
}

/**
 * Everyone but `self`, within `maxDistance` of them, each paired with its
 * own squared distance — the common first step both `stepCrowdOrca`'s
 * `nearestNeighbors` (which goes on to rank and cap the count for its own
 * linear program) and `stepCrowdMoussaid`'s `neighborCircles` (which does
 * not cap — every ray cast is only ever O(neighbours), not a per-neighbour
 * LP line) take before diverging into their own model-specific shape.
 */
export function agentsWithinDistance(
  self: Pick<SimulationAgent, "id" | "x" | "y">,
  agents: readonly SimulationAgent[],
  maxDistance: number,
): { agent: SimulationAgent; distSq: number }[] {
  const maxDistSq = maxDistance * maxDistance;
  return agents
    .filter((other) => other.id !== self.id)
    .map((other) => ({
      agent: other,
      distSq: (other.x - self.x) ** 2 + (other.y - self.y) ** 2,
    }))
    .filter((entry) => entry.distSq <= maxDistSq);
}
