import type { SimulationShop } from "./simulationDecisionBackend";
import type { SimulationAgent } from "./simulationEngine";

export type StoreTraffic = { id: string; browsing: number; queuing: number };

export type CrowdFlowAnalytics = {
  perShop: StoreTraffic[];
  totalShopping: number;
  totalQueuing: number;
  busiestShopId: string | null;
};

/**
 * Real store traffic from the live simulation: how many shoppers are browsing
 * vs queuing at each shop right now. Derived only from agent state, so it is a
 * faithful read of what the crowd is actually doing (not an estimate). Feeds
 * credible commercial/satisfaction signals.
 */
export function crowdFlowAnalytics(
  agents: readonly Pick<SimulationAgent, "lifecycleState" | "selectedStoreId">[],
  shops: readonly Pick<SimulationShop, "id">[],
): CrowdFlowAnalytics {
  const browsing = new Map<string, number>();
  const queuing = new Map<string, number>();

  for (const agent of agents) {
    if (!agent.selectedStoreId) {
      continue;
    }
    if (agent.lifecycleState === "browse") {
      browsing.set(
        agent.selectedStoreId,
        (browsing.get(agent.selectedStoreId) ?? 0) + 1,
      );
    } else if (agent.lifecycleState === "queue") {
      queuing.set(
        agent.selectedStoreId,
        (queuing.get(agent.selectedStoreId) ?? 0) + 1,
      );
    }
  }

  const perShop = shops.map((shop) => ({
    id: shop.id,
    browsing: browsing.get(shop.id) ?? 0,
    queuing: queuing.get(shop.id) ?? 0,
  }));

  let totalShopping = 0;
  let totalQueuing = 0;
  let busiestShopId: string | null = null;
  let busiest = 0;
  for (const shop of perShop) {
    totalShopping += shop.browsing;
    totalQueuing += shop.queuing;
    if (shop.browsing > busiest) {
      busiest = shop.browsing;
      busiestShopId = shop.id;
    }
  }

  return { perShop, totalShopping, totalQueuing, busiestShopId };
}
