import { isRiding } from "./floorTransfers";
import type { SimulationAgent } from "./simulationEngine";

/**
 * People who arrive together: friends, couples, families.
 *
 * SOURCE: Moussaïd, Perozo, Garnier, Helbing & Theraulaz (2010), "The walking
 * behaviour of pedestrian social groups and its impact on crowd dynamics",
 * PLoS ONE 5(4): e10047. On a crowded commercial walkway on a Saturday
 * afternoon (their population B, 0.25 P/m²) 70% of 3,461 pedestrians walked in
 * one of 1,093 groups, almost all of two to four people; group speed fell
 * linearly with size, v = 1.24 − 0.08·n m/s; members walked side by side,
 * 0.40 m apart at that density (0.54 m at 0.03 P/m²).
 *
 * What is taken from it: the share of people in groups, the mean group size
 * (2,423 people in 1,093 groups = 2.22), the size–speed slope, the side-by-side
 * formation and its spacing. Between members only body contact acts, not the
 * social push strangers keep (self-chosen; with it pairs held 0.9 m apart).
 * What is NOT: the split between pairs, triples and
 * fours is not tabulated there, so it is chosen here to give that mean with
 * pairs most common; the formation spring is self-chosen; and the paper's own
 * group force model (gaze and attraction terms) is not implemented.
 */
export const walkingGroupParameters = {
  /** Share of people who arrive in a group (population B). */
  shareOfPeopleInGroups: 0.7,
  /** Group sizes 2, 3, 4: chosen to give the observed mean of 2.22. */
  sizeWeights: [0.81, 0.16, 0.03] as const,
  /** Walking speed of a group of n people, m/s: 1.24 − 0.08·n. */
  speedIntercept: 1.24,
  speedSlopePerMember: 0.08,
  /** Centre-to-centre distance between neighbours walking abreast, m. */
  spacingMeters: 0.5,
  /** Pull toward one's place in the formation, 1/s². Self-chosen. */
  formationGain: 1,
};

const meanGroupSize = walkingGroupParameters.sizeWeights.reduce(
  (total, weight, index) => total + weight * (index + 2),
  0,
);

/**
 * Draw how many people the next arrival is. `shareOfPeopleInGroups` is a share
 * of people, not of arrivals: with share s and mean group size g, a fraction
 * s/g : (1 − s) of arrivals are groups : singles.
 */
export function sampleArrivalSize(
  random: () => number,
  shareOfPeopleInGroups = walkingGroupParameters.shareOfPeopleInGroups,
): number {
  const groups = shareOfPeopleInGroups / meanGroupSize;
  const singles = 1 - shareOfPeopleInGroups;
  if (groups <= 0 || random() * (groups + singles) < singles) return 1;
  let remaining = random();
  const weights = walkingGroupParameters.sizeWeights;
  for (let index = 0; index < weights.length; index++) {
    remaining -= weights[index];
    if (remaining < 0) return index + 2;
  }
  return weights.length + 1;
}

/** People per arrival on average: turns a rate of people into a rate of arrivals. */
export function meanArrivalSize(
  shareOfPeopleInGroups = walkingGroupParameters.shareOfPeopleInGroups,
): number {
  // People / arrivals = 1 / (singles + groups) where both are per person.
  return 1 / (1 - shareOfPeopleInGroups + shareOfPeopleInGroups / meanGroupSize);
}

/**
 * A group's free speed relative to someone walking alone, from the observed
 * linear fall with group size.
 */
export function groupSpeedRatio(size: number): number {
  const { speedIntercept, speedSlopePerMember } = walkingGroupParameters;
  return (
    (speedIntercept - speedSlopePerMember * size) /
    (speedIntercept - speedSlopePerMember)
  );
}

/** Plan fields a companion takes from whoever leads the group. */
const sharedStates = new Set(["walk", "browse", "enterStore", "leave", "evacuate"]);

/**
 * The leader (lowest id still present) decides for the group; companions go
 * where the leader goes and do what the leader does. They do not stand in
 * lines or take a till: while the leader queues or pays, they wait nearby.
 */
export function splitGroups(agents: readonly SimulationAgent[]) {
  const leaders = new Map<number, SimulationAgent>();
  for (const agent of agents) {
    if (agent.groupId === undefined) continue;
    const leader = leaders.get(agent.groupId);
    if (!leader || agent.id < leader.id) leaders.set(agent.groupId, agent);
  }
  const isCompanion = (agent: SimulationAgent) =>
    agent.groupId !== undefined && leaders.get(agent.groupId) !== agent;
  return { isCompanion, leaders };
}

export function followLeaders(
  agents: readonly SimulationAgent[],
  leaders: ReadonlyMap<number, SimulationAgent>,
): SimulationAgent[] {
  return agents.map((agent) => {
    const leader = agent.groupId === undefined ? undefined : leaders.get(agent.groupId);
    if (!leader || leader.id === agent.id || leader.lifecycleState === undefined) {
      return agent;
    }
    // Someone on the treads takes no orders: they are mid-crossing, and the
    // connector they are on is recorded in their transfer. Rewriting it from
    // the leader's plan dropped them off again every decision tick, so a
    // companion rode the same staircase for the whole run without arriving.
    if (isRiding(agent)) {
      return agent;
    }
    const shared = sharedStates.has(leader.lifecycleState);
    const differentFloor = (leader.floorId ?? null) !== (agent.floorId ?? null);
    if (!shared) {
      // The leader is in a line or at a till: wait where you are rather than
      // crowd into the line (walking toward the leader's place in it blocked
      // the counters and halved the demo scene's exits).
      //
      // Unless they are waiting on another floor, in which case waiting here
      // means never catching them up: follow them across first, and wait on
      // the floor they are on.
      if (differentFloor) {
        return {
          ...agent,
          lifecycleState: "walk",
          selectedStoreId: undefined,
          ...crossToLeader(agent, leader),
        };
      }
      const settled = Math.hypot(agent.targetX - agent.x, agent.targetY - agent.y) < 1;
      return {
        ...agent,
        lifecycleState: "walk",
        selectedStoreId: undefined,
        targetX: settled ? agent.targetX : agent.x,
        targetY: settled ? agent.targetY : agent.y,
      };
    }
    if (differentFloor) {
      // Catch the leader up first. Taking their state as well would have a
      // companion still downstairs standing in a shop they have not reached:
      // browse and the till states hold someone where they are (crowdMovement),
      // so the companion would never walk to the stairs at all.
      return {
        ...agent,
        browseUntilSeconds: undefined,
        exitIds: leader.exitIds,
        lifecycleState: "walk",
        selectedStoreId: undefined,
        targetSinkId: leader.targetSinkId,
        ...crossToLeader(agent, leader),
      };
    }
    return {
      ...agent,
      browseUntilSeconds: leader.browseUntilSeconds,
      exitIds: leader.exitIds,
      lifecycleState: leader.lifecycleState,
      selectedStoreId: leader.selectedStoreId,
      targetSinkId: leader.targetSinkId,
      targetX: leader.targetX,
      targetY: leader.targetY,
      // Where the leader is going, including which floor it is on (ADR-0010).
      // Copying only the coordinates left companions walking to the leader's
      // destination as though it were on their own floor: they never took the
      // stairs, and the group split the first time its leader changed floor.
      ...leaderFloorFields(leader),
    };
  });
}

/**
 * The companion's share of the leader's journey: the leader's destination and
 * its floor, with no connector chosen — each companion picks their own, since
 * they are standing somewhere else (planFloorLegs).
 */
function leaderFloorFields(leader: SimulationAgent) {
  const destination = leader.transfer;

  if (!destination) {
    // Somewhere on the floor they are both standing on: nothing to cross.
    return { transfer: undefined };
  }

  return {
    transfer: {
      // No connector chosen: planFloorLegs picks the one nearest this
      // companion, who is standing somewhere else than the leader.
      connectorId: "",
      shaftId: "",
      finalX: destination.finalX,
      finalY: destination.finalY,
      floorId: destination.floorId,
    },
  };
}

/** Head for where the leader is standing, on the floor they are standing on. */
function crossToLeader(agent: SimulationAgent, leader: SimulationAgent) {
  if (isRiding(leader)) {
    // The leader has no floor of their own right now: `leader.floorId` is a
    // connector's own flight lane (floorTransfers), a place a decision can
    // send its rider and nobody else. `leader.x`/`leader.y` are coordinates on
    // that lane, meaningless on any real floor a companion could stand on. Aim
    // at the leader's actual destination instead; the next planFloorLegs picks
    // whichever connector gets the companion there from where they really are
    // — most often the very one the leader is on.
    return {
      targetX: agent.x,
      targetY: agent.y,
      transfer: { ...leader.transfer!, connectorId: "", shaftId: "" },
    };
  }

  if (leader.floorId === undefined) {
    return { targetX: agent.x, targetY: agent.y, transfer: undefined };
  }

  return {
    targetX: leader.x,
    targetY: leader.y,
    transfer: {
      connectorId: "",
      shaftId: "",
      finalX: leader.x,
      finalY: leader.y,
      floorId: leader.floorId,
    },
  };
}

export type GroupFormation = {
  /** Where each walking group member should be, keyed by agent id. */
  slots: Map<number, { x: number; y: number }>;
};

/**
 * Side-by-side places for members of groups on the move: a line through the
 * group's centre, across its mean direction of travel, in id order.
 */
export function groupFormation(agents: readonly SimulationAgent[]): GroupFormation {
  const members = new Map<number, SimulationAgent[]>();
  for (const agent of agents) {
    if (agent.groupId === undefined || !isMoving(agent)) continue;
    const list = members.get(agent.groupId);
    if (list) list.push(agent);
    else members.set(agent.groupId, [agent]);
  }
  const slots = new Map<number, { x: number; y: number }>();
  for (const group of members.values()) {
    if (group.length < 2) continue;
    let cx = 0;
    let cy = 0;
    let hx = 0;
    let hy = 0;
    for (const member of group) {
      cx += member.x / group.length;
      cy += member.y / group.length;
      hx += member.targetX - member.x;
      hy += member.targetY - member.y;
    }
    const heading = Math.hypot(hx, hy);
    if (heading < 1e-6) continue;
    // Across the direction of travel.
    const ax = -hy / heading;
    const ay = hx / heading;
    group
      .slice()
      .sort((left, right) => left.id - right.id)
      .forEach((member, rank) => {
        const offset =
          (rank - (group.length - 1) / 2) * walkingGroupParameters.spacingMeters;
        slots.set(member.id, { x: cx + ax * offset, y: cy + ay * offset });
      });
  }
  return { slots };
}

function isMoving(agent: SimulationAgent) {
  const state = agent.lifecycleState;
  return state === undefined || state === "walk" || state === "leave";
}
