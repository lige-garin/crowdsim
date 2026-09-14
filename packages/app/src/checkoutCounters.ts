import type { ScenePoint } from "@crowdsim/scene-schema";
import { hashUnit, sampleServiceSeconds } from "./behaviorDistributions";
import type {
  SimulationAgentDecision,
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationAgent } from "./simulationEngine";

/**
 * Checkout counters as service points: a number of servers, a service time
 * distribution, and a line in front (ADR-0008).
 *
 * Every buyer who reached a counter used to be served at once, in parallel,
 * however many arrived, so no queue could ever form at a till. Now a counter
 * serves at most `servers` people; the rest stand in a line, are let in head
 * first, and give up when their patience runs out.
 *
 * States: `checkout` is walking to a counter, or — once `queueJoinedSeconds` is
 * set — standing in its line; `enterStore` is being served.
 */

/**
 * Spacing between people standing in any line, shop or counter, metres.
 * Self-chosen: people keep roughly half a metre to a metre from the person ahead.
 */
export const queueSpacingMeters = 0.7;

/** Line order: who joined first, then lower id. */
export const byLineOrder = (a: SimulationAgent, b: SimulationAgent) =>
  (a.queueJoinedSeconds ?? 0) - (b.queueJoinedSeconds ?? 0) || a.id - b.id;
/** Assumed walking speed for choosing a counter; only ranks counters. */
const planningSpeedMetersPerSecond = 1.34;

type CounterState = {
  counter: SimulationServicePoint;
  /** Unit direction the line grows in. */
  direction: ScenePoint;
  inService: number;
  /** Waiting buyers still in line after this tick's admissions, head first. */
  line: SimulationAgent[];
};

export type CounterTickOptions = {
  agents: readonly SimulationAgent[];
  elapsedSeconds: number;
  seed: number;
  servicePoints: readonly SimulationServicePoint[];
  shops: readonly SimulationShop[];
  /** When the shopper would give up waiting, from now. */
  patienceDeadline: (agent: SimulationAgent) => number;
  /** A decision sending the agent home. */
  leave: (agent: SimulationAgent) => SimulationAgentDecision;
  evacuationActive?: boolean;
};

export function createCounterTick(options: CounterTickOptions) {
  const { agents, elapsedSeconds, seed, servicePoints } = options;
  const shopCentre = centroid(options.shops.map((shop) => shop.position));
  const states = new Map<string, CounterState>();
  for (const counter of servicePoints) {
    states.set(counter.id, {
      counter,
      direction: lineDirection(counter.position, shopCentre),
      inService: 0,
      line: [],
    });
  }

  for (const agent of agents) {
    const state = agent.servicePointId ? states.get(agent.servicePointId) : undefined;
    if (!state) continue;
    if (agent.lifecycleState === "enterStore") state.inService++;
    else if (
      agent.lifecycleState === "checkout" &&
      agent.queueJoinedSeconds !== undefined
    )
      state.line.push(agent);
  }

  const admitted = new Set<number>();
  for (const state of states.values()) {
    state.line.sort(byLineOrder);
    if (options.evacuationActive) continue;
    while (state.line.length > 0 && state.inService < servers(state.counter)) {
      admitted.add(state.line.shift()!.id);
      state.inService++;
    }
  }

  function serve(agent: SimulationAgent, state: CounterState): SimulationAgentDecision {
    const { counter } = state;
    // Stand somewhere along the counter, not all on one point.
    const along = (hashUnit(seed, agent.id, counter.id, "till") - 0.5) * counter.radius;
    return {
      agentId: agent.id,
      nextState: "enterStore",
      servicePointId: counter.id,
      target: {
        x: counter.position.x - state.direction.y * along,
        y: counter.position.y + state.direction.x * along,
      },
      browseUntilSeconds:
        elapsedSeconds +
        sampleServiceSeconds(counter.serviceSeconds, seed, agent.id, counter.id),
      queueJoinedSeconds: null,
      queueUntilSeconds: null,
      walkProgress: null,
    };
  }

  function slot(state: CounterState, place: number): ScenePoint {
    const head = Math.max(1, state.counter.radius * 0.5);
    const distance = head + place * queueSpacingMeters;
    return {
      x: state.counter.position.x + state.direction.x * distance,
      y: state.counter.position.y + state.direction.y * distance,
    };
  }

  return {
    /**
     * The counter this buyer should head for: least walking time plus waiting
     * time, where the wait is the line ahead over the servers, times the mean
     * service time. Undefined when the scene has no counters.
     */
    chooseCounter(agent: SimulationAgent): SimulationServicePoint | undefined {
      let best: SimulationServicePoint | undefined;
      let bestCost = Infinity;
      for (const state of states.values()) {
        const { counter } = state;
        const walk =
          Math.hypot(counter.position.x - agent.x, counter.position.y - agent.y) /
          planningSpeedMetersPerSecond;
        const ahead = Math.max(
          0,
          state.line.length + state.inService - servers(counter) + 1,
        );
        const wait = (ahead / servers(counter)) * counter.serviceSeconds;
        if (walk + wait < bestCost) {
          bestCost = walk + wait;
          best = counter;
        }
      }
      return best;
    },

    /** Decision for a buyer walking to, or waiting at, a counter. */
    decideCheckout(agent: SimulationAgent): SimulationAgentDecision | undefined {
      const state = agent.servicePointId ? states.get(agent.servicePointId) : undefined;
      if (!state) return undefined;
      if (admitted.has(agent.id)) return serve(agent, state);

      if (agent.queueJoinedSeconds !== undefined) {
        if (
          agent.queueUntilSeconds !== undefined &&
          elapsedSeconds >= agent.queueUntilSeconds
        ) {
          return options.leave(agent);
        }
        const place = state.line.indexOf(agent);
        const target = slot(state, Math.max(0, place));
        if (Math.hypot(target.x - agent.targetX, target.y - agent.targetY) <= 0.05) {
          return undefined;
        }
        return {
          agentId: agent.id,
          nextState: "checkout",
          servicePointId: state.counter.id,
          target,
        };
      }

      const { counter } = state;
      if (
        Math.hypot(counter.position.x - agent.x, counter.position.y - agent.y) >
        counter.radius
      ) {
        return undefined;
      }
      if (state.line.length === 0 && state.inService < servers(counter)) {
        state.inService++;
        return serve(agent, state);
      }
      state.line.push(agent);
      return {
        agentId: agent.id,
        nextState: "checkout",
        servicePointId: counter.id,
        target: slot(state, state.line.length - 1),
        queueJoinedSeconds: elapsedSeconds,
        queueUntilSeconds: options.patienceDeadline(agent),
        walkProgress: null,
      };
    },
  };
}

/** People served at once; a counter built without a count serves everyone. */
function servers(counter: SimulationServicePoint) {
  return counter.servers ?? Infinity;
}

function centroid(points: readonly ScenePoint[]): ScenePoint | undefined {
  if (points.length === 0) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/** Lines grow from the counter toward the shops buyers come from; south if none. */
function lineDirection(from: ScenePoint, toward: ScenePoint | undefined): ScenePoint {
  if (!toward) return { x: 0, y: 1 };
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.hypot(dx, dy);
  return length > 1e-6 ? { x: dx / length, y: dy / length } : { x: 0, y: 1 };
}
