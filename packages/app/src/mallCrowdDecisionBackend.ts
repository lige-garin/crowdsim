import type { ScenePoint } from "@crowdsim/scene-schema";
import type {
  SimulationAgentDecision,
  SimulationDecisionBackend,
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationSink } from "./simulationEngine";
import { chooseBrandStore, type BrandStoreCandidate } from "./brandAttraction";
import { createAgentMindset } from "./agentPersona";

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

function nearestServicePoint(
  point: ScenePoint,
  servicePoints: readonly SimulationServicePoint[],
): SimulationServicePoint {
  let best = servicePoints[0];
  let bestSq = Number.POSITIVE_INFINITY;
  for (const servicePoint of servicePoints) {
    const dx = servicePoint.position.x - point.x;
    const dy = servicePoint.position.y - point.y;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      best = servicePoint;
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
  brandStores?: readonly BrandStoreCandidate[];
}): SimulationDecisionBackend {
  const random = mulberry32(options.seed ?? 1);
  const mindsetSeed = options.seed ?? 1;

  return {
    id: "rule-ts",
    decisionHz: options.decisionHz ?? 10,
    decideAgents({ agents, elapsedSeconds, sinks, shops, servicePoints, evacuationActive }) {
      const activeShops = shops ?? options.shops;
      const activeServicePoints = servicePoints ?? [];
      const decisions: SimulationAgentDecision[] = [];
      const shopById = new Map(activeShops.map((shop) => [shop.id, shop]));

      // Live occupancy (current browsers) per shop; enter() reserves a slot so
      // concurrent arrivals in one tick cannot overfill a shop.
      const occupancy = new Map<string, number>();
      for (const agent of agents) {
        if (agent.lifecycleState === "browse" && agent.selectedStoreId) {
          occupancy.set(
            agent.selectedStoreId,
            (occupancy.get(agent.selectedStoreId) ?? 0) + 1,
          );
        }
      }
      const hasRoom = (shopId: string) => {
        const shop = shopById.get(shopId);
        return shop ? (occupancy.get(shopId) ?? 0) < shop.capacity : false;
      };
      const enter = (shopId: string) =>
        occupancy.set(shopId, (occupancy.get(shopId) ?? 0) + 1);
      const browseDecision = (
        agentId: number,
        shop: SimulationShop,
      ): SimulationAgentDecision => ({
        agentId,
        nextState: "browse",
        selectedStoreId: shop.id,
        target: shop.position,
        browseUntilSeconds: elapsedSeconds + shop.dwellSeconds,
      });

      for (const agent of agents) {
        const state = agent.lifecycleState;

        // Evacuation overrides shopping: abandon the shop, head for the exit.
        if (evacuationActive) {
          if (state !== "evacuate") {
            const sink = nearestSink(agent, sinks);
            decisions.push({
              agentId: agent.id,
              nextState: "evacuate",
              target: sink.position,
              targetSinkId: sink.id,
              selectedStoreId: undefined,
              browseUntilSeconds: null,
            });
          }
          continue;
        }

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
            const shop = agent.selectedStoreId
              ? shopById.get(agent.selectedStoreId)
              : undefined;
            // A buyer (per the shop's conversion rate) heads to a checkout;
            // a non-buyer (or a mall with no checkouts) leaves directly.
            const buys =
              activeServicePoints.length > 0 &&
              shop !== undefined &&
              random() < shop.conversionRate;
            if (buys) {
              const counter = nearestServicePoint(agent, activeServicePoints);
              decisions.push({
                agentId: agent.id,
                nextState: "checkout",
                target: counter.position,
                selectedStoreId: undefined,
                browseUntilSeconds: null,
              });
            } else {
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
          }
          continue;
        }

        // Walking to a checkout: start the service once at the counter.
        if (state === "checkout") {
          if (activeServicePoints.length > 0) {
            const counter = nearestServicePoint(agent, activeServicePoints);
            const dx = counter.position.x - agent.x;
            const dy = counter.position.y - agent.y;
            if (Math.hypot(dx, dy) <= counter.radius) {
              decisions.push({
                agentId: agent.id,
                nextState: "enterStore",
                target: counter.position,
                browseUntilSeconds: elapsedSeconds + counter.serviceSeconds,
              });
            }
          }
          continue;
        }

        // Being served at a checkout: leave when the service completes.
        if (state === "enterStore") {
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
              browseUntilSeconds: null,
            });
          }
          continue;
        }

        // Queued: enter as soon as a slot frees, otherwise keep waiting.
        if (state === "queue" && agent.selectedStoreId) {
          const shop = shopById.get(agent.selectedStoreId);
          if (shop && hasRoom(shop.id)) {
            enter(shop.id);
            decisions.push(browseDecision(agent.id, shop));
          }
          continue;
        }

        // Walking and arrived: browse if there is room, else join the queue.
        if (state === "walk" && agent.selectedStoreId) {
          const shop = shopById.get(agent.selectedStoreId);
          if (shop) {
            const dx = shop.position.x - agent.x;
            const dy = shop.position.y - agent.y;
            if (Math.hypot(dx, dy) <= shop.radius) {
              if (hasRoom(shop.id)) {
                enter(shop.id);
                decisions.push(browseDecision(agent.id, shop));
              } else {
                decisions.push({
                  agentId: agent.id,
                  nextState: "queue",
                  selectedStoreId: shop.id,
                  target: shop.queuePosition,
                });
              }
            }
          }
          continue;
        }

        // Fresh shopper: choose a shop. With brand data, use the persona/brand
        // store-choice model so different personas favour different shops;
        // otherwise fall back to attraction-weighted choice.
        let chosen: SimulationShop | undefined;
        if (options.brandStores && options.brandStores.length > 0) {
          const mindset = createAgentMindset({ agentId: agent.id, seed: mindsetSeed });
          const choice = chooseBrandStore(mindset, options.brandStores, {
            agentPosition: { x: agent.x, y: agent.y },
            randomUnit: random(),
          });
          chosen = choice ? shopById.get(choice.store.id) : undefined;
        }
        if (!chosen) {
          chosen = pickShopByAttraction(activeShops, random());
        }
        decisions.push({
          agentId: agent.id,
          nextState: "walk",
          selectedStoreId: chosen.id,
          target: chosen.position,
        });
      }

      return decisions;
    },
  };
}
