import {
  nearest,
  nearestAllowedSink,
  type SimulationServicePoint,
  type SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";

type ReconcileGeometry = {
  servicePoints: readonly SimulationServicePoint[];
  shops: readonly SimulationShop[];
  sinks: readonly SimulationSink[];
};

/**
 * Bring a live crowd in line with edited geometry (ADR-0007 rule 4).
 *
 * Agents hold scene entities by id or by position. After an edit removes one,
 * those references point at nothing, and the behaviour backend skips what it
 * cannot find — so the agent stands there for the rest of the run, holding a
 * crowd slot. So:
 *
 * - its shop is gone → give up on it and head for the nearest exit (a balk);
 * - its checkout counter is gone → walk to the nearest remaining counter, or
 *   leave if there is none;
 * - its exit is gone → retarget the nearest remaining exit;
 * - no exits remain at all → it cannot finish; it is dropped from the run
 *   but not counted as having exited, because nobody walked out.
 *
 * Nobody is moved. An agent that now stands inside a new wall is left to the
 * engine's no-progress detection; relocating people silently would falsify the
 * trajectory.
 */
export function reconcileAgentsWithScene(
  agents: readonly SimulationAgent[],
  geometry: ReconcileGeometry,
): SimulationAgent[] {
  const shopIds = new Set(geometry.shops.map((shop) => shop.id));
  const sinkIds = new Set(geometry.sinks.map((sink) => sink.id));
  const next: SimulationAgent[] = [];

  for (const agent of agents) {
    const lostShop =
      agent.selectedStoreId !== undefined && !shopIds.has(agent.selectedStoreId);
    const lostSink =
      agent.targetSinkId !== undefined && !sinkIds.has(agent.targetSinkId);
    const atCounter =
      agent.lifecycleState === "checkout" || agent.lifecycleState === "enterStore";
    const lostCounter =
      atCounter &&
      !geometry.servicePoints.some((point) => point.id === agent.servicePointId);
    if (!lostShop && !lostSink && !lostCounter) {
      next.push(agent);
      continue;
    }
    if (geometry.sinks.length === 0) {
      continue;
    }

    const sink = nearestAllowedSink(agent, geometry.sinks, agent.exitIds);
    const updated: SimulationAgent = { ...agent, targetSinkId: sink.id };

    if (lostCounter && geometry.servicePoints.length > 0) {
      // Still wants to pay: go to the counter that is left.
      const counter = nearest(agent, geometry.servicePoints);
      updated.lifecycleState = "checkout";
      updated.servicePointId = counter.id;
      updated.targetX = counter.position.x;
      updated.targetY = counter.position.y;
      updated.walkProgress = undefined;
      updated.queueJoinedSeconds = undefined;
      updated.queueUntilSeconds = undefined;
      updated.browseUntilSeconds = undefined;
      next.push(updated);
      continue;
    }

    const giveUp = lostShop || lostCounter;
    const exitBound =
      giveUp ||
      agent.lifecycleState === undefined ||
      agent.lifecycleState === "leave" ||
      agent.lifecycleState === "evacuate";
    if (giveUp) {
      updated.lifecycleState =
        agent.lifecycleState === "evacuate" ? "evacuate" : "leave";
      updated.selectedStoreId = undefined;
      updated.servicePointId = undefined;
      updated.browseUntilSeconds = undefined;
      updated.queueUntilSeconds = undefined;
      updated.queueJoinedSeconds = undefined;
    }
    if (exitBound) {
      updated.targetX = sink.position.x;
      updated.targetY = sink.position.y;
      // Progress was measured against the old target.
      updated.walkProgress = undefined;
    }
    next.push(updated);
  }

  return next;
}
