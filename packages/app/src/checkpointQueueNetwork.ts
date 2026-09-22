import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { sampleServiceSeconds } from "./behaviorDistributions";

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
 * Deliberately out of scope for stage 1, and not attempted here: priority
 * lanes (the plan's own "优先通道") — every stage here is one FIFO line, no
 * eligibility or fast-track concept; branching networks (a stage's `next` is
 * a single id, not a choice of several — a linear chain, not a general
 * graph); and any live fault model — an outage is a scripted time window
 * (`servicePointSchema.outageWindows`), not something that can be triggered
 * by, say, a hazard or a random failure process.
 */

export type CheckpointOutageWindow = { startsAtSeconds: number; endsAtSeconds: number };

export type CheckpointStage = {
  id: string;
  servers: number;
  serviceMeanSeconds: number;
  /** The next stage a party moves to once served here, if any. Absent: this
   * stage is a network exit. */
  nextStageId?: string;
  outageWindows: readonly CheckpointOutageWindow[];
};

export type CheckpointPartyStatus = "queued" | "inService" | "exited";

export type CheckpointParty = {
  id: number;
  stageId: string;
  status: CheckpointPartyStatus;
  queueJoinedSeconds: number;
  serviceEndsAtSeconds: number | null;
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
): CheckpointParty {
  return {
    id,
    queueJoinedSeconds: elapsedSeconds,
    serviceEndsAtSeconds: null,
    stageId,
    status: "queued",
  };
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
  }

  const advanced: CheckpointParty[] = parties.map((party) => {
    if (
      party.status !== "inService" ||
      (party.serviceEndsAtSeconds ?? Infinity) > elapsedSeconds
    ) {
      return party;
    }
    const stage = stagesById.get(party.stageId)!;
    const { nextStageId } = stage;
    return nextStageId
      ? {
          id: party.id,
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
    const inServiceCount = here.filter((party) => party.status === "inService").length;
    const queue = here.filter((party) => party.status === "queued").sort(byQueueOrder);

    let admitted = inServiceCount;
    const admittedIds = new Set<number>();
    if (!isDown(stage, elapsedSeconds)) {
      for (const party of queue) {
        if (admitted >= stage.servers) break;
        admittedIds.add(party.id);
        admitted++;
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
