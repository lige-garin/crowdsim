import type { ScenePoint } from "@crowdsim/scene-schema";
import type { FloorPlace } from "./floorRouting";
import {
  nearestSinkByRoute,
  placeOf,
  type SimulationAgentDecision,
  type SimulationDecisionBackend,
  type SimulationShop,
} from "./simulationDecisionBackend";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import { chooseBrandStore, type BrandStoreCandidate } from "./brandAttraction";
import { clamp01, createAgentMindset } from "./agentPersona";
import { gravityWeight } from "./odEntryModel";
import {
  hashUnit,
  sampleDwellSeconds,
  sampleEvacuationReactionSeconds,
} from "./behaviorDistributions";
import { byLineOrder, createCounterTick, queueSpacingMeters } from "./checkoutCounters";
import { isCrossingFloors } from "./floorTransfers";
import { mulberry32 } from "./simulationEngineRandom";

/**
 * How much extra walking one person already committed to a door is worth, in
 * metres, when choosing an exit during an evacuation.
 *
 * SELF-CHOSEN AND NOT CALIBRATED: this project has no observed evacuation to
 * fit a number to. The claim is only that "nearest exit" is wrong — it sends
 * everyone to one door and jams it while another stands empty — and that
 * spreading the choice over the exits a building has is closer to what people
 * do. The size of the spread is a guess.
 */
const evacuationExitCrowdingMeters = 4;

/**
 * The exit to head for in an evacuation: the nearest, penalised by how many
 * people are already committed to it. Falls back to a straight-line distance
 * where no router is supplied, the same way the rest of the backend does.
 */
function chooseEvacuationSink(
  agent: SimulationAgent,
  sinks: readonly SimulationSink[],
  loads: ReadonlyMap<string, number>,
  routeDistance?: (from: FloorPlace, to: FloorPlace) => number,
): SimulationSink {
  // Every exit, not only the ones the agent's entrance names. Which door you
  // came in by tells you nothing in a fire, and a building's own evacuation
  // plan does not reserve exits per entrance.
  let best = sinks[0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const sink of sinks) {
    const distance = routeDistance
      ? routeDistance(agent, placeOf(sink))
      : Math.hypot(sink.position.x - agent.x, sink.position.y - agent.y);
    const cost = distance + evacuationExitCrowdingMeters * (loads.get(sink.id) ?? 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = sink;
    }
  }
  return best;
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

/** Where the person `index` places back from the head of the line stands. */
export function queueSlotPosition(shop: SimulationShop, index: number): ScenePoint {
  const direction = shop.queueDirection ?? { x: 0, y: 1 };
  return {
    x: shop.queuePosition.x + direction.x * queueSpacingMeters * index,
    y: shop.queuePosition.y + direction.y * queueSpacingMeters * index,
  };
}

/** The spot on the shop floor this shopper browses at: stable per shopper and shop. */
export function browseSpot(
  shop: SimulationShop,
  seed: number,
  agentId: number,
): ScenePoint {
  const area = shop.browseArea;
  if (!area) return shop.position;
  return {
    x: area.x + (hashUnit(seed, agentId, shop.id, "browse-x") * 2 - 1) * area.halfWidth,
    y:
      area.y + (hashUnit(seed, agentId, shop.id, "browse-y") * 2 - 1) * area.halfHeight,
  };
}
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
  /**
   * Random stream for shop choice. Defaults to a fresh stream from `seed`; a
   * hot scene update passes the stream the previous backend was using, so an
   * edit continues the sequence instead of replaying it (ADR-0007).
   */
  random?: () => number;
}): SimulationDecisionBackend {
  const random = options.random ?? mulberry32(options.seed ?? 1);
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
      evacuationStartedSeconds,
      routeDistance,
    }) {
      const activeShops = shops ?? options.shops;
      const activeServicePoints = servicePoints ?? [];
      const decisions: SimulationAgentDecision[] = [];
      const shopById = new Map(activeShops.map((shop) => [shop.id, shop]));

      // Who is already committed to which exit. Without it "nearest exit" sends
      // everyone at one door and jams it while another stands empty.
      const exitLoad = new Map<string, number>();
      for (const agent of agents) {
        if (agent.lifecycleState === "evacuate" && agent.targetSinkId) {
          exitLoad.set(agent.targetSinkId, (exitLoad.get(agent.targetSinkId) ?? 0) + 1);
        }
      }
      // Time since the alarm. Reactions are measured from there, not from the
      // start of the run, and the first tick of an evacuation is zero.
      const secondsSinceAlarm = evacuationActive
        ? elapsedSeconds - (evacuationStartedSeconds ?? elapsedSeconds)
        : 0;

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

      // Each line in order of arrival. The head is let in first: shoppers used
      // to be admitted in array order, so whoever spawned first jumped the line,
      // and everyone waited on the same point.
      const lines = new Map<string, SimulationAgent[]>();
      for (const agent of agents) {
        if (agent.lifecycleState !== "queue" || !agent.selectedStoreId) continue;
        const line = lines.get(agent.selectedStoreId);
        if (line) line.push(agent);
        else lines.set(agent.selectedStoreId, [agent]);
      }
      const admitted = new Set<number>();
      const placeInLine = new Map<number, number>();
      for (const [shopId, line] of lines) {
        line.sort(byLineOrder);
        let place = 0;
        for (const agent of line) {
          if (!evacuationActive && place === 0 && hasRoom(shopId)) {
            admitted.add(agent.id);
            bump(queueLength, shopId, -1);
            enter(shopId);
            continue;
          }
          placeInLine.set(agent.id, place++);
        }
      }
      const joinQueue = (shopId: string) => bump(queueLength, shopId, 1);
      const leaveQueue = (shopId: string) => bump(queueLength, shopId, -1);
      const browseDecision = (
        agentId: number,
        shop: SimulationShop,
      ): SimulationAgentDecision => ({
        agentId,
        nextState: "browse",
        selectedStoreId: shop.id,
        target: browseSpot(shop, mindsetSeed, agentId),
        targetFloorId: shop.floorId,
        queueJoinedSeconds: null,
        // Each shopper draws their own dwell around the shop's mean: a fixed
        // dwell made every browser in a shop leave in lockstep.
        browseUntilSeconds:
          elapsedSeconds +
          sampleDwellSeconds(shop.dwellSeconds, mindsetSeed, agentId, shop.id),
        queueUntilSeconds: null,
        walkProgress: null,
      });
      const leaveDecision = (agent: SimulationAgent): SimulationAgentDecision => {
        const sink = nearestSinkByRoute(agent, sinks, agent.exitIds, routeDistance);
        return {
          agentId: agent.id,
          nextState: "leave",
          target: sink.position,
          targetFloorId: sink.floorId,
          targetSinkId: sink.id,
          selectedStoreId: undefined,
          browseUntilSeconds: null,
          queueUntilSeconds: null,
          queueJoinedSeconds: null,
          servicePointId: null,
          walkProgress: null,
        };
      };
      // Patience comes from the persona traits, which are a pure hash of
      // (agentId, seed): the renege deadline stays reproducible per run.
      const patienceDeadline = (agent: SimulationAgent) =>
        elapsedSeconds +
        queuePatienceMinSeconds +
        createAgentMindset({ agentId: agent.id, seed: mindsetSeed }).traits.patience *
          queuePatienceRangeSeconds;
      const counters = createCounterTick({
        agents,
        elapsedSeconds,
        evacuationActive,
        leave: leaveDecision,
        patienceDeadline,
        seed: mindsetSeed,
        servicePoints: activeServicePoints,
        shops: activeShops,
      });
      const walkDecision = (
        agent: SimulationAgent,
        shop: SimulationShop,
      ): SimulationAgentDecision => ({
        agentId: agent.id,
        nextState: "walk",
        selectedStoreId: shop.id,
        target: shop.position,
        targetFloorId: shop.floorId,
        queueUntilSeconds: null,
        // A shopper diverted from one line starts at the back of the next.
        queueJoinedSeconds: null,
        walkProgress: null,
      });
      const queueDecision = (
        agent: SimulationAgent,
        shop: SimulationShop,
        place: number,
      ): SimulationAgentDecision => ({
        agentId: agent.id,
        nextState: "queue",
        selectedStoreId: shop.id,
        target: queueSlotPosition(shop, place),
        targetFloorId: shop.floorId,
        queueJoinedSeconds: agent.queueJoinedSeconds ?? elapsedSeconds,
        queueUntilSeconds: patienceDeadline(agent),
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

        // Evacuation overrides shopping: abandon the shop, head for an exit.
        if (evacuationActive) {
          // Not everyone on the same tick. Each person has a pre-movement time
          // (right-skewed, behaviorDistributions); until theirs has passed they
          // carry on with what they were doing, which is what the notice-and-
          // confirm delay looks like from outside.
          if (
            state !== "evacuate" &&
            secondsSinceAlarm >= sampleEvacuationReactionSeconds(mindsetSeed, agent.id)
          ) {
            const sink = chooseEvacuationSink(agent, sinks, exitLoad, routeDistance);
            exitLoad.set(sink.id, (exitLoad.get(sink.id) ?? 0) + 1);
            decisions.push({
              agentId: agent.id,
              nextState: "evacuate",
              target: sink.position,
              targetFloorId: sink.floorId,
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
          decisions.push(leaveDecision(agent));
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
            const counter = buys ? counters.chooseCounter(agent) : undefined;
            if (counter) {
              decisions.push({
                agentId: agent.id,
                nextState: "checkout",
                servicePointId: counter.id,
                target: counter.position,
                targetFloorId: counter.floorId,
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

        // Walking to, or waiting in line at, a checkout (checkoutCounters).
        if (state === "checkout") {
          const decision = counters.decideCheckout(agent);
          if (decision) decisions.push(decision);
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

          if (admitted.has(agent.id)) {
            decisions.push(browseDecision(agent.id, shop));
            continue;
          }
          const place = placeInLine.get(agent.id) ?? 0;

          if (agent.queueUntilSeconds === undefined) {
            decisions.push(queueDecision(agent, shop, place));
            continue;
          }

          // Renege: an unbounded wait is what deadlocked an under-capacity mall.
          if (elapsedSeconds >= agent.queueUntilSeconds) {
            leaveQueue(shop.id);
            divertOrLeave(agent, shop.id);
            continue;
          }

          // Shuffle forward as the line moves.
          const slot = queueSlotPosition(shop, place);
          if (Math.hypot(slot.x - agent.targetX, slot.y - agent.targetY) > 0.05) {
            decisions.push({
              agentId: agent.id,
              nextState: "queue",
              selectedStoreId: shop.id,
              target: slot,
            });
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
              // Joins at the back: everyone already in line, bar those let in.
              decisions.push(
                queueDecision(agent, shop, (queueLength.get(shop.id) ?? 1) - 1),
              );
            } else {
              divertOrLeave(agent, shop.id);
            }
            continue;
          }

          // Blocked route detection: `walk` only ends inside the arrival
          // radius, so a shopper cut off from its shop used to occupy an agent
          // slot forever. Progress is walking distance, so a detour round a
          // building counts; a shop walls cut off entirely never progresses.
          const progress = agent.walkProgress;
          const remaining = routeDistance
            ? routeDistance(agent, placeOf(shop))
            : distance;

          // Crossing a floor is not a stalled walk. A rider is held for the
          // flight's travel time and someone queueing for it is standing
          // still, so without this the stall rule (5 s) fires part way up any
          // real staircase (14.7 s for a 4.5 m storey) and sends a shopper who
          // is on their way to an exit instead. The distance already reached
          // is kept, so the walk is judged from the same baseline afterwards.
          if (isCrossingFloors(agent)) {
            decisions.push({
              agentId: agent.id,
              nextState: "walk",
              selectedStoreId: shop.id,
              walkProgress: {
                distance: Math.min(remaining, progress?.distance ?? remaining),
                tick: decisionTick,
              },
            });
            continue;
          }

          if (
            !progress ||
            (Number.isFinite(remaining) &&
              remaining <= progress.distance - walkProgressEpsilonMeters)
          ) {
            decisions.push({
              agentId: agent.id,
              nextState: "walk",
              selectedStoreId: shop.id,
              walkProgress: { distance: remaining, tick: decisionTick },
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
          // The crowd and queue this shopper would face right now, so a packed
          // store with a long line actually loses custom.
          const liveStores = options.brandStores.map((store) => {
            const shop = shopById.get(store.id);
            return {
              ...store,
              crowdLevel: shop
                ? clamp01((occupancy.get(store.id) ?? 0) / Math.max(1, shop.capacity))
                : 0,
              queueLength: queueLength.get(store.id) ?? 0,
            };
          });
          const choice = chooseBrandStore(mindset, liveStores, {
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
