import type { ScenePoint } from "@crowdsim/scene-schema";
import type {
  SimulationAgentDecision,
  SimulationDecisionBackend,
  SimulationServicePoint,
  SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import { chooseBrandStore, type BrandStoreCandidate } from "./brandAttraction";
import { createAgentMindset } from "./agentPersona";
import { gravityWeight } from "./odEntryModel";

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

/**
 * Gravity store choice: weight each shop by attraction attenuated by distance
 * from the shopper (P2 retail behaviour layer). decay = 0 reduces to
 * pickShopByAttraction; higher decay favours nearer shops.
 */
function pickShopByGravity(
  shops: readonly SimulationShop[],
  origin: ScenePoint,
  random01: number,
  distanceDecay: number,
): SimulationShop {
  const weights = shops.map((shop) => {
    const dx = shop.position.x - origin.x;
    const dy = shop.position.y - origin.y;
    return gravityWeight(shop.attraction, Math.hypot(dx, dy), distanceDecay);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return shops[Math.min(shops.length - 1, Math.floor(random01 * shops.length))];
  }

  let remaining = random01 * total;
  for (let i = 0; i < shops.length; i++) {
    remaining -= weights[i];
    if (remaining <= 0) {
      return shops[i];
    }
  }
  return shops[shops.length - 1];
}

/**
 * Waiting room per shop, expressed in service slots. A shop with no cap on the
 * line accepts arrivals forever, which is how an under-capacity mall used to
 * freeze: every shopper ended up queuing and nobody could reach a state that
 * ever leaves the world.
 */
const queueSlotsPerCapacity = 2;
/** Patience window (seconds) spanned by the persona `patience` trait 0..1. */
const queuePatienceMinSeconds = 30;
const queuePatienceRangeSeconds = 120;
/** Distance decay used to rank fallback shops after a balk/renege/blocked walk. */
const fallbackDistanceDecay = 0.05;
/** A walk counts as progress only if it closes at least this much distance. */
const walkProgressEpsilonMeters = 0.25;
/** Decision ticks without progress before a walker gives up (10 Hz => 5 s). */
const walkStallDecisionTicks = 50;

function distanceBetween(from: ScenePoint, to: ScenePoint) {
  return Math.hypot(to.x - from.x, to.y - from.y);
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
  /**
   * Gravity distance-decay for store choice (P2). When > 0, fresh shoppers favour
   * nearer shops via pickShopByGravity; 0/undefined keeps attraction-only choice.
   */
  distanceDecay?: number;
}): SimulationDecisionBackend {
  const random = mulberry32(options.seed ?? 1);
  const mindsetSeed = options.seed ?? 1;

  return {
    id: "rule-ts",
    decisionHz: options.decisionHz ?? 10,
    decideAgents({
      agents,
      decisionTick,
      elapsedSeconds,
      sinks,
      shops,
      servicePoints,
      evacuationActive,
    }) {
      const activeShops = shops ?? options.shops;
      const activeServicePoints = servicePoints ?? [];
      const decisions: SimulationAgentDecision[] = [];
      const shopById = new Map(activeShops.map((shop) => [shop.id, shop]));

      // Live occupancy (current browsers) and line length per shop; enter() and
      // joinQueue() reserve a slot so concurrent arrivals in one tick cannot
      // overfill a shop or its line.
      const occupancy = new Map<string, number>();
      const queueLength = new Map<string, number>();
      const bump = (counter: Map<string, number>, shopId: string, delta: number) =>
        counter.set(shopId, Math.max(0, (counter.get(shopId) ?? 0) + delta));
      for (const agent of agents) {
        if (!agent.selectedStoreId) {
          continue;
        }

        if (agent.lifecycleState === "browse") {
          bump(occupancy, agent.selectedStoreId, 1);
        } else if (agent.lifecycleState === "queue") {
          bump(queueLength, agent.selectedStoreId, 1);
        }
      }
      const hasRoom = (shopId: string) => {
        const shop = shopById.get(shopId);
        return shop ? (occupancy.get(shopId) ?? 0) < shop.capacity : false;
      };
      const hasQueueRoom = (shopId: string) => {
        const shop = shopById.get(shopId);
        return shop
          ? (queueLength.get(shopId) ?? 0) <
              Math.max(1, Math.ceil(shop.capacity * queueSlotsPerCapacity))
          : false;
      };
      const enter = (shopId: string) => bump(occupancy, shopId, 1);
      const joinQueue = (shopId: string) => bump(queueLength, shopId, 1);
      const leaveQueue = (shopId: string) => bump(queueLength, shopId, -1);
      const browseDecision = (
        agentId: number,
        shop: SimulationShop,
      ): SimulationAgentDecision => ({
        agentId,
        nextState: "browse",
        selectedStoreId: shop.id,
        target: shop.position,
        browseUntilSeconds: elapsedSeconds + shop.dwellSeconds,
        queueUntilSeconds: null,
        walkProgress: null,
      });
      const leaveDecision = (agent: SimulationAgent): SimulationAgentDecision => {
        const sink = nearestSink(agent, sinks);
        return {
          agentId: agent.id,
          nextState: "leave",
          target: sink.position,
          targetSinkId: sink.id,
          selectedStoreId: undefined,
          browseUntilSeconds: null,
          queueUntilSeconds: null,
          walkProgress: null,
        };
      };
      const walkDecision = (
        agent: SimulationAgent,
        shop: SimulationShop,
      ): SimulationAgentDecision => ({
        agentId: agent.id,
        nextState: "walk",
        selectedStoreId: shop.id,
        target: shop.position,
        queueUntilSeconds: null,
        walkProgress: null,
      });
      const queueDecision = (
        agent: SimulationAgent,
        shop: SimulationShop,
      ): SimulationAgentDecision => ({
        agentId: agent.id,
        nextState: "queue",
        selectedStoreId: shop.id,
        target: shop.queuePosition,
        // Patience comes from the persona traits, which are a pure hash of
        // (agentId, seed): the renege deadline stays reproducible per run.
        queueUntilSeconds:
          elapsedSeconds +
          queuePatienceMinSeconds +
          createAgentMindset({ agentId: agent.id, seed: mindsetSeed }).traits.patience *
            queuePatienceRangeSeconds,
        walkProgress: null,
      });
      /**
       * Next-best shop that can still take the shopper, ranked by attraction
       * attenuated by distance. Deliberately not RNG-driven: a balking or
       * reneging shopper picks the best remaining option, and the draw order of
       * fresh shoppers stays untouched.
       */
      const fallbackShop = (agent: SimulationAgent, excludedShopId: string) => {
        let best: SimulationShop | undefined;
        let bestWeight = 0;

        for (const shop of activeShops) {
          if (shop.id === excludedShopId) {
            continue;
          }

          if (!hasRoom(shop.id) && !hasQueueRoom(shop.id)) {
            continue;
          }

          const weight = gravityWeight(
            shop.attraction,
            distanceBetween(agent, shop.position),
            fallbackDistanceDecay,
          );

          if (weight > bestWeight) {
            bestWeight = weight;
            best = shop;
          }
        }

        return best;
      };
      const divertOrLeave = (agent: SimulationAgent, excludedShopId: string) => {
        const alternative = fallbackShop(agent, excludedShopId);
        decisions.push(
          alternative ? walkDecision(agent, alternative) : leaveDecision(agent),
        );
      };

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
              queueUntilSeconds: null,
              walkProgress: null,
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
            walkProgress: null,
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
                walkProgress: null,
              });
            } else {
              decisions.push(leaveDecision(agent));
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
            decisions.push(leaveDecision(agent));
          }
          continue;
        }

        // Queued: enter as soon as a slot frees, give up when patience runs out.
        if (state === "queue" && agent.selectedStoreId) {
          const shop = shopById.get(agent.selectedStoreId);
          if (!shop) {
            continue;
          }

          if (hasRoom(shop.id)) {
            leaveQueue(shop.id);
            enter(shop.id);
            decisions.push(browseDecision(agent.id, shop));
            continue;
          }

          if (agent.queueUntilSeconds === undefined) {
            decisions.push(queueDecision(agent, shop));
            continue;
          }

          // Renege: an unbounded wait is what deadlocked an under-capacity mall.
          if (elapsedSeconds >= agent.queueUntilSeconds) {
            leaveQueue(shop.id);
            divertOrLeave(agent, shop.id);
          }
          continue;
        }

        // Walking and arrived: browse if there is room, queue if the line has
        // room, otherwise balk to another shop (or leave).
        if (state === "walk" && agent.selectedStoreId) {
          const shop = shopById.get(agent.selectedStoreId);
          if (!shop) {
            continue;
          }

          const distance = distanceBetween(agent, shop.position);

          if (distance <= shop.radius) {
            if (hasRoom(shop.id)) {
              enter(shop.id);
              decisions.push(browseDecision(agent.id, shop));
            } else if (hasQueueRoom(shop.id)) {
              joinQueue(shop.id);
              decisions.push(queueDecision(agent, shop));
            } else {
              divertOrLeave(agent, shop.id);
            }
            continue;
          }

          // Blocked route detection: walls make sliding movement stall dead, and
          // `walk` only ends inside the arrival radius, so a shopper cut off from
          // its shop used to occupy an agent slot forever.
          const progress = agent.walkProgress;

          if (!progress || distance <= progress.distance - walkProgressEpsilonMeters) {
            decisions.push({
              agentId: agent.id,
              nextState: "walk",
              selectedStoreId: shop.id,
              walkProgress: { distance, tick: decisionTick },
            });
          } else if (decisionTick - progress.tick >= walkStallDecisionTicks) {
            // Head for an exit rather than another shop: the shopper has proven
            // it cannot reach this target, and re-picking shops could bounce it
            // between equally unreachable ones forever.
            decisions.push(leaveDecision(agent));
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
          chosen =
            options.distanceDecay && options.distanceDecay > 0
              ? pickShopByGravity(
                  activeShops,
                  { x: agent.x, y: agent.y },
                  random(),
                  options.distanceDecay,
                )
              : pickShopByAttraction(activeShops, random());
        }
        decisions.push(walkDecision(agent, chosen));
      }

      return decisions;
    },
  };
}
