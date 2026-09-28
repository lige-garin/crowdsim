import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { hashUnit, sampleServiceSeconds } from "../engine/behaviorDistributions";

/**
 * SP-3-adjacent stage 1 for gap-closure plan batch 5.2 ("多级排队网络" —
 * multi-stage queueing networks): service points chained into a sequence —
 * "security check, then ticket gate, then escalator" as one journey — with
 * scripted outage windows whose backpressure on a downstream stage is the
 * "故障级联" (cascading failure) the plan named, not a separate mechanism.
 *
 * Deliberately a new, standalone, generic N-server-FIFO primitive, NOT a
 * reuse of `checkoutCounters.ts`'s existing one — despite that module doing
 * the same underlying thing (servers, a service-time distribution, a line).
 * `checkoutCounters.ts` is fused to mall/pedestrian specifics this network
 * has no reason to carry: `SimulationAgent`'s full lifecycle state machine
 * (`checkout`/`enterStore`), `browseUntilSeconds`, and a queue-line direction
 * computed from the shop centroid. Reusing it here would mean either
 * overloading pedestrian lifecycle states with checkpoint semantics that
 * don't fit, or refactoring a live, heavily-tested production module — not
 * attempted this pass. What genuinely is reused: `sampleServiceSeconds`
 * (Erlang-2, `behaviorDistributions.ts`), since it is already a generic
 * distribution sampler with no mall coupling.
 *
 * Deliberately standalone, the same shape this session's ORCA, Moussaïd and
 * vehicle-simulation stage-1 layers took (ADR-0013, ADR-0014, ADR-0016): a
 * real, tested model, NOT wired into `simulationEngine.ts`, the live decision
 * backend, the worker, the viewport, or the editor.
 *
 * Priority lanes and weighted branching added in ADR-0030 (gap-closure plan
 * batch 5.2's remaining "优先通道"/branching items): `priorityServers`
 * reserves some of a stage's own servers as a genuine dedicated fast lane
 * (not queue-jumping within one shared pool — see the ADR for why), and
 * `branches` lets a served party's next stage be a deterministic weighted
 * draw among several, rather than always the one fixed `nextStageId`.
 *
 * Deliberately still out of scope: any live fault model — an outage is a
 * scripted time window (`servicePointSchema.outageWindows`), not something
 * that can be triggered by, say, a hazard or a random failure process; and
 * load-aware branching — a branch's weight is fixed at authoring time, not
 * adjusted by which downstream stage is currently shorter.
 */

export type CheckpointOutageWindow = { startsAtSeconds: number; endsAtSeconds: number };

/** One weighted candidate in a stage's `branches` (ADR-0030). */
export type CheckpointBranch = { stageId: string; weight: number };

export type CheckpointStage = {
  id: string;
  servers: number;
  /** Of `servers`, how many are reserved exclusively for
   * `priorityEligible` parties (ADR-0030) — a dedicated fast lane, not
   * queue-jumping within a shared pool; see the ADR for why. 0 (the
   * default every existing stage reads as) means no priority lane. Must be
   * <= `servers`. */
  priorityServers?: number;
  serviceMeanSeconds: number;
  /** The next stage a party moves to once served here, if any. Absent: this
   * stage is a network exit. Ignored when `branches` is present. */
  nextStageId?: string;
  /** Several weighted next-stage candidates (ADR-0030); when present, a
   * served party's own next stage is drawn from these instead of the fixed
   * `nextStageId`, deterministically per party. Absent (the default every
   * existing stage reads as) keeps the single-choice `nextStageId` chain. */
  branches?: readonly CheckpointBranch[];
  outageWindows: readonly CheckpointOutageWindow[];
};

export type CheckpointPartyStatus = "queued" | "inService" | "exited";

export type CheckpointParty = {
  id: number;
  stageId: string;
  status: CheckpointPartyStatus;
  queueJoinedSeconds: number;
  serviceEndsAtSeconds: number | null;
  /** Eligible for a stage's priority lane, if it has one (ADR-0030).
   * Absent is the same as false — every existing party reads this way. */
  priorityEligible?: boolean;
};

/** Builds a stage from a scene's own service point, the same conversion
 * shape `buildRoadRuntime` uses for vehicles (ADR-0016): scene-schema
 * defaults become simulation-ready runtime data, once. */
export function buildCheckpointStage(
  servicePoint: CrowdSimScene["servicePoints"][number],
): CheckpointStage {
  return {
    id: servicePoint.id,
    nextStageId: servicePoint.nextServicePointId,
    outageWindows: servicePoint.outageWindows,
    serviceMeanSeconds: servicePoint.serviceMeanSeconds,
    servers:
      servicePoint.servers ??
      Math.max(
        1,
        Math.round(
          (servicePoint.capacityPerMinute * servicePoint.serviceMeanSeconds) / 60,
        ),
      ),
  };
}

export function spawnParty(
  id: number,
  stageId: string,
  elapsedSeconds: number,
  priorityEligible = false,
): CheckpointParty {
  return {
    id,
    priorityEligible,
    queueJoinedSeconds: elapsedSeconds,
    serviceEndsAtSeconds: null,
    stageId,
    status: "queued",
  };
}

/** A served party's own next stage (ADR-0030): `branches`, drawn
 * deterministically by weight, when the stage declares any; otherwise the
 * existing single `nextStageId`. `undefined` means the network exit either
 * way. */
function nextStageIdFor(
  stage: CheckpointStage,
  party: CheckpointParty,
  seed: number,
): string | undefined {
  if (!stage.branches || stage.branches.length === 0) {
    return stage.nextStageId;
  }
  const totalWeight = stage.branches.reduce((sum, branch) => sum + branch.weight, 0);
  if (totalWeight <= 0) {
    return undefined;
  }
  const draw = hashUnit(seed, party.id, stage.id, "branch") * totalWeight;
  let cumulative = 0;
  for (const branch of stage.branches) {
    cumulative += branch.weight;
    if (draw < cumulative) {
      return branch.stageId;
    }
  }
  return stage.branches[stage.branches.length - 1].stageId;
}

function isDown(stage: CheckpointStage, elapsedSeconds: number): boolean {
  return stage.outageWindows.some(
    (window) =>
      elapsedSeconds >= window.startsAtSeconds && elapsedSeconds < window.endsAtSeconds,
  );
}

const byQueueOrder = (a: CheckpointParty, b: CheckpointParty) =>
  a.queueJoinedSeconds - b.queueJoinedSeconds || a.id - b.id;

export type CheckpointNetworkStepInput = {
  stages: readonly CheckpointStage[];
  parties: readonly CheckpointParty[];
  elapsedSeconds: number;
  seed: number;
};

/**
 * One tick: parties whose service finished this tick move on (to the next
 * stage's queue, or exit the network); each stage not currently in an
 * outage window then admits from its own queue, FIFO, up to its own server
 * count. A stage in an outage admits nobody new but still finishes whoever
 * it was already serving — the natural way a downstream stage starves while
 * an earlier one is down, and floods once it recovers, without a separate
 * "cascading" mechanism of its own.
 *
 * A party that exits the network this tick is dropped from the returned
 * array, not kept with `status: "exited"` — the same despawn lesson this
 * session's own ponytail-review just paid for in `vehicleSimulation.ts`
 * (ADR-0016): a caller that keeps feeding the same array back in every tick
 * would otherwise accumulate every party that has ever left, forever. A
 * caller that wants an exit count diffs the id sets before and after a step
 * itself, the same way `simulationEngine.ts`'s own counters do.
 *
 * Throws, rather than silently dropping the party, if a party's own stage
 * or a stage's `nextStageId` is missing from `stages` — the same review
 * flagged that a missing stage would otherwise read exactly like a normal
 * exit, which is the one failure this module cannot let pass silently.
 */
export function stepCheckpointNetwork(
  input: CheckpointNetworkStepInput,
): CheckpointParty[] {
  const { elapsedSeconds, parties, seed, stages } = input;
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));

  // Checked for every party up front, not only ones finishing service this
  // tick: a queued party at an unknown stage would otherwise fall out of
  // `byStage` below with no stage to ever admit it from, silently — exactly
  // the same failure a bad `nextStageId` is guarded against further down.
  for (const party of parties) {
    if (!stagesById.has(party.stageId)) {
      throw new Error(
        `Party ${party.id} is at stage '${party.stageId}', which is not in the stages passed to this step`,
      );
    }
  }
  for (const stage of stages) {
    if (stage.nextStageId !== undefined && !stagesById.has(stage.nextStageId)) {
      throw new Error(
        `Stage '${stage.id}' chains to '${stage.nextStageId}', which is not in the stages passed to this step`,
      );
    }
    for (const branch of stage.branches ?? []) {
      if (!stagesById.has(branch.stageId)) {
        throw new Error(
          `Stage '${stage.id}' branches to '${branch.stageId}', which is not in the stages passed to this step`,
        );
      }
    }
  }

  const advanced: CheckpointParty[] = parties.map((party) => {
    if (
      party.status !== "inService" ||
      (party.serviceEndsAtSeconds ?? Infinity) > elapsedSeconds
    ) {
      return party;
    }
    const stage = stagesById.get(party.stageId)!;
    const nextStageId = nextStageIdFor(stage, party, seed);
    return nextStageId
      ? {
          id: party.id,
          priorityEligible: party.priorityEligible,
          queueJoinedSeconds: elapsedSeconds,
          serviceEndsAtSeconds: null,
          stageId: nextStageId,
          status: "queued",
        }
      : { ...party, status: "exited" };
  });

  const byStage = new Map<string, CheckpointParty[]>();
  for (const party of advanced) {
    if (party.status === "exited") continue;
    const list = byStage.get(party.stageId) ?? [];
    list.push(party);
    byStage.set(party.stageId, list);
  }

  const result: CheckpointParty[] = [];
  for (const stage of stages) {
    const here = (byStage.get(stage.id) ?? []).slice();
    // A party only counts as using the priority lane when the stage
    // actually has one (ADR-0030) — with priorityServers 0 (the default),
    // every party falls into the single "regular" pool with the stage's
    // full server count, reproducing the original single-queue behaviour
    // exactly regardless of any party's own priorityEligible flag.
    const priorityServers = Math.min(
      stage.servers,
      Math.max(0, stage.priorityServers ?? 0),
    );
    const usesPriorityLane = (party: CheckpointParty) =>
      priorityServers > 0 && party.priorityEligible === true;

    const admittedIds = new Set<number>();
    if (!isDown(stage, elapsedSeconds)) {
      for (const [servers, pool] of [
        [priorityServers, here.filter(usesPriorityLane)],
        [stage.servers - priorityServers, here.filter((p) => !usesPriorityLane(p))],
      ] as const) {
        let admitted = pool.filter((party) => party.status === "inService").length;
        const queue = pool
          .filter((party) => party.status === "queued")
          .sort(byQueueOrder);
        for (const party of queue) {
          if (admitted >= servers) break;
          admittedIds.add(party.id);
          admitted++;
        }
      }
    }

    for (const party of here) {
      if (party.status === "inService" || admittedIds.has(party.id)) {
        result.push({
          ...party,
          serviceEndsAtSeconds:
            party.serviceEndsAtSeconds ??
            elapsedSeconds +
              sampleServiceSeconds(stage.serviceMeanSeconds, seed, party.id, stage.id),
          status: "inService",
        });
      } else {
        result.push(party);
      }
    }
  }

  return result;
}
