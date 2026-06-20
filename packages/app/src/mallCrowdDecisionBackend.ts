import type { ScenePoint } from "@crowdsim/scene-schema";
import type {
  SimulationAgentDecision,
  SimulationDecisionBackend,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationSink } from "./simulationEngine";

/** Deterministic PRNG so shop choice is reproducible for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickShopByAttraction(
  shops: readonly SimulationShop[],
  random01: number,
): SimulationShop {
  const total = shops.reduce((sum, shop) => sum + Math.max(0, shop.attraction), 0);
  if (total <= 0) {
    return shops[Math.min(shops.length - 1, Math.floor(random01 * shops.length))];
  }

  let remaining = random01 * total;
  for (const shop of shops) {
    remaining -= Math.max(0, shop.attraction);
    if (remaining <= 0) {
      return shop;
    }
  }
  return shops[shops.length - 1];
}

function nearestSink(
  point: ScenePoint,
  sinks: readonly SimulationSink[],
): SimulationSink {
  let best = sinks[0];
  let bestSq = Number.POSITIVE_INFINITY;
  for (const sink of sinks) {
    const dx = sink.position.x - point.x;
    const dy = sink.position.y - point.y;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      best = sink;
      bestSq = sq;
    }
  }
  return best;
}

/**
 * Rule-based mall-crowd behaviour: a shopper enters, walks to a shop chosen by
 * attraction, browses it for the shop's dwell time, then leaves toward the
 * nearest exit. This is what makes the crowd "move with a reason" (varied
 * destinations + walk/browse/leave states) instead of streaming straight to the
 * exit. With no shops it degrades to walking to the nearest sink.
 */
export function createMallCrowdDecisionBackend(options: {
  shops: readonly SimulationShop[];
  seed?: number;
  decisionHz?: number;
}): SimulationDecisionBackend {
  const random = mulberry32(options.seed ?? 1);

  return {
    id: "rule-ts",
    decisionHz: options.decisionHz ?? 10,
    decideAgents({ agents, elapsedSeconds, sinks, shops }) {
      const activeShops = shops ?? options.shops;
      const decisions: SimulationAgentDecision[] = [];

      for (const agent of agents) {
        const state = agent.lifecycleState;

        if (state === "leave") {
          continue;
        }

        if (activeShops.length === 0) {
          const sink = nearestSink(agent, sinks);
          decisions.push({
            agentId: agent.id,
            nextState: "leave",
            target: sink.position,
            targetSinkId: sink.id,
          });
          continue;
        }

        if (state === "browse") {
          if (
            agent.browseUntilSeconds != null &&
            elapsedSeconds >= agent.browseUntilSeconds
          ) {
            const sink = nearestSink(agent, sinks);
            decisions.push({
              agentId: agent.id,
              nextState: "leave",
              target: sink.position,
              targetSinkId: sink.id,
              selectedStoreId: undefined,
              browseUntilSeconds: null,
            });
          }
          continue;
        }

        if (state === "walk" && agent.selectedStoreId) {
          const shop = activeShops.find((s) => s.id === agent.selectedStoreId);
          if (shop) {
            const dx = shop.position.x - agent.x;
            const dy = shop.position.y - agent.y;
            if (Math.hypot(dx, dy) <= shop.radius) {
              decisions.push({
                agentId: agent.id,
                nextState: "browse",
                selectedStoreId: shop.id,
                target: shop.position,
                browseUntilSeconds: elapsedSeconds + shop.dwellSeconds,
              });
            }
          }
          continue;
        }

        // Fresh shopper: pick a shop by attraction and walk to it.
        const shop = pickShopByAttraction(activeShops, random());
        decisions.push({
          agentId: agent.id,
          nextState: "walk",
          selectedStoreId: shop.id,
          target: shop.position,
        });
      }

      return decisions;
    },
  };
}
