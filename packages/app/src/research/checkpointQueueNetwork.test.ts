import { parseScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import {
  buildCheckpointStage,
  spawnParty,
  stepCheckpointNetwork,
  type CheckpointParty,
  type CheckpointStage,
} from "./checkpointQueueNetwork";

function stage(overrides: Partial<CheckpointStage> = {}): CheckpointStage {
  return {
    id: "stage-a",
    outageWindows: [],
    serviceMeanSeconds: 10,
    servers: 1,
    ...overrides,
  };
}

describe("buildCheckpointStage", () => {
  function scene(overrides: Record<string, unknown> = {}) {
    return parseScene({
      schemaVersion: "1.0.0" as const,
      id: "checkpoint-test",
      name: "Checkpoint test",
      world: { width: 100, height: 100 },
      servicePoints: [
        {
          id: "security",
          kind: "gate",
          position: { x: 10, y: 10 },
          ...overrides,
        },
      ],
    });
  }

  it("derives servers from capacity and service time when not declared", () => {
    const built = scene({ capacityPerMinute: 30, serviceMeanSeconds: 20 });
    // max(1, round(30 * 20 / 60)) = 10
    expect(buildCheckpointStage(built.servicePoints[0]).servers).toBe(10);
  });

  it("uses an explicit server count over the derived one", () => {
    const built = scene({ servers: 4, capacityPerMinute: 30, serviceMeanSeconds: 20 });
    expect(buildCheckpointStage(built.servicePoints[0]).servers).toBe(4);
  });

  it("carries the chain and outage windows through", () => {
    const built = parseScene({
      schemaVersion: "1.0.0" as const,
      id: "checkpoint-test-2",
      name: "Checkpoint test 2",
      world: { width: 100, height: 100 },
      servicePoints: [
        {
          id: "security",
          kind: "gate",
          position: { x: 10, y: 10 },
          nextServicePointId: "ticket-gate",
          outageWindows: [{ startsAtSeconds: 100, endsAtSeconds: 200 }],
        },
        { id: "ticket-gate", kind: "gate", position: { x: 20, y: 10 } },
      ],
    });
    const built2 = buildCheckpointStage(built.servicePoints[0]);
    expect(built2.nextStageId).toBe("ticket-gate");
    expect(built2.outageWindows).toEqual([
      { startsAtSeconds: 100, endsAtSeconds: 200 },
    ]);
  });
});

describe("spawnParty", () => {
  it("creates a party queued at the given stage from the given moment", () => {
    expect(spawnParty(7, "stage-a", 42)).toEqual({
      id: 7,
      queueJoinedSeconds: 42,
      serviceEndsAtSeconds: null,
      stageId: "stage-a",
      status: "queued",
    });
  });
});

describe("stepCheckpointNetwork: single-stage FIFO", () => {
  it("admits only up to the server count, leaving the rest queued", () => {
    const stages = [stage({ servers: 2 })];
    const parties = [
      spawnParty(1, "stage-a", 0),
      spawnParty(2, "stage-a", 0),
      spawnParty(3, "stage-a", 0),
    ];

    const after = stepCheckpointNetwork({
      elapsedSeconds: 0,
      parties,
      seed: 1,
      stages,
    });

    const byId = new Map(after.map((party) => [party.id, party]));
    expect(byId.get(1)!.status).toBe("inService");
    expect(byId.get(2)!.status).toBe("inService");
    expect(byId.get(3)!.status).toBe("queued");
  });

  it("admits earlier arrivals first, ties broken by id", () => {
    const stages = [stage({ servers: 1 })];
    const parties = [
      spawnParty(9, "stage-a", 5),
      spawnParty(2, "stage-a", 1),
      spawnParty(3, "stage-a", 1),
    ];

    const after = stepCheckpointNetwork({
      elapsedSeconds: 5,
      parties,
      seed: 1,
      stages,
    });
    const byId = new Map(after.map((party) => [party.id, party]));
    expect(byId.get(2)!.status).toBe("inService"); // earliest queueJoinedSeconds
    expect(byId.get(3)!.status).toBe("queued");
    expect(byId.get(9)!.status).toBe("queued");
  });

  it("drops a party from the returned array once it exits (no further stage)", () => {
    const stages = [stage({ servers: 1, serviceMeanSeconds: 5 })];
    let parties: CheckpointParty[] = [spawnParty(1, "stage-a", 0)];

    for (let t = 0; t <= 60; t++) {
      parties = stepCheckpointNetwork({ elapsedSeconds: t, parties, seed: 1, stages });
    }

    expect(parties).toHaveLength(0);
  });
});

describe("stepCheckpointNetwork: chaining (security -> ticket gate)", () => {
  const stages = [
    stage({
      id: "security",
      nextStageId: "ticket-gate",
      serviceMeanSeconds: 4,
      servers: 1,
    }),
    stage({ id: "ticket-gate", serviceMeanSeconds: 4, servers: 1 }),
  ];

  it("moves a party to the next stage's queue only after finishing the first", () => {
    let parties: CheckpointParty[] = [spawnParty(1, "security", 0)];

    // Service time is a random (Erlang-2) draw around the 4 s mean, not an
    // exact duration, so this looks for whichever tick the move actually
    // happens on rather than assuming it's exactly t=4.
    let movedAtTick: number | undefined;
    for (let t = 0; t <= 60 && movedAtTick === undefined; t++) {
      parties = stepCheckpointNetwork({ elapsedSeconds: t, parties, seed: 1, stages });
      if (parties.find((p) => p.id === 1)?.stageId === "ticket-gate") {
        movedAtTick = t;
      }
    }

    expect(movedAtTick).toBeDefined();
    // Didn't skip the first stage's queue by moving on the very first tick.
    expect(movedAtTick!).toBeGreaterThan(0);
  });

  it("never lets a party skip the first stage's queue by starting straight at the second", () => {
    // A party queued directly at "ticket-gate" is unaffected by "security" --
    // this is really just confirming stages are independent, not a
    // meaningful chain-skipping guard, but pins the assumption down.
    const parties = [spawnParty(1, "ticket-gate", 0)];
    const after = stepCheckpointNetwork({
      elapsedSeconds: 0,
      parties,
      seed: 1,
      stages,
    });
    expect(after[0].stageId).toBe("ticket-gate");
    expect(after[0].status).toBe("inService");
  });
});

describe("stepCheckpointNetwork: outage and cascading backpressure", () => {
  const stages = [
    stage({
      id: "security",
      nextStageId: "ticket-gate",
      serviceMeanSeconds: 2,
      servers: 1,
    }),
    stage({ id: "ticket-gate", serviceMeanSeconds: 2, servers: 1 }),
  ];
  const downStages = [
    { ...stages[0], outageWindows: [{ endsAtSeconds: 30, startsAtSeconds: 0 }] },
    stages[1],
  ];

  it("admits nobody new at a stage during its own outage window", () => {
    const parties = [spawnParty(1, "security", 0)];
    const after = stepCheckpointNetwork({
      elapsedSeconds: 0,
      parties,
      seed: 1,
      stages: downStages,
    });
    expect(after[0].status).toBe("queued");
  });

  it("finishes a party already in service when the outage began", () => {
    const parties: CheckpointParty[] = [
      {
        ...spawnParty(1, "security", -1),
        serviceEndsAtSeconds: 2,
        status: "inService",
      },
    ];
    const after = stepCheckpointNetwork({
      elapsedSeconds: 2,
      parties,
      seed: 1,
      stages: downStages,
    });
    expect(after.find((p) => p.id === 1)?.stageId).toBe("ticket-gate");
  });

  it("starves the downstream stage while the upstream one is down, then lets it flood once it recovers", () => {
    // Ten parties queue at "security" from the start; "security" is down for
    // the first 30 seconds.
    let parties: CheckpointParty[] = Array.from({ length: 10 }, (_, index) =>
      spawnParty(index + 1, "security", 0),
    );

    let sawTicketGateArrival = false;
    for (let t = 0; t <= 29; t++) {
      parties = stepCheckpointNetwork({
        elapsedSeconds: t,
        parties,
        seed: 1,
        stages: downStages,
      });
      if (parties.some((p) => p.stageId === "ticket-gate")) sawTicketGateArrival = true;
    }
    // Nobody could have reached "ticket-gate": "security" never admitted anyone.
    expect(sawTicketGateArrival).toBe(false);
    expect(
      parties.every((p) => p.stageId === "security" && p.status === "queued"),
    ).toBe(true);

    // Once the outage ends, "security" starts serving its backed-up queue,
    // and arrivals at "ticket-gate" follow.
    for (let t = 30; t <= 50; t++) {
      parties = stepCheckpointNetwork({
        elapsedSeconds: t,
        parties,
        seed: 1,
        stages: downStages,
      });
    }
    expect(parties.some((p) => p.stageId === "ticket-gate")).toBe(true);
  });
});

describe("stepCheckpointNetwork: fails loud on a missing stage", () => {
  it("throws rather than silently dropping a party whose own stage is missing", () => {
    const parties = [spawnParty(1, "no-such-stage", 0)];
    expect(() =>
      stepCheckpointNetwork({ elapsedSeconds: 0, parties, seed: 1, stages: [] }),
    ).toThrow(/no-such-stage/);
  });

  it("throws rather than silently dropping a party whose next stage is missing", () => {
    const brokenChain = [
      stage({ id: "security", nextStageId: "no-such-gate", serviceMeanSeconds: 1 }),
    ];
    const parties: CheckpointParty[] = [
      {
        ...spawnParty(1, "security", -1),
        serviceEndsAtSeconds: 0,
        status: "inService",
      },
    ];
    expect(() =>
      stepCheckpointNetwork({
        elapsedSeconds: 0,
        parties,
        seed: 1,
        stages: brokenChain,
      }),
    ).toThrow(/no-such-gate/);
  });
});

describe("stepCheckpointNetwork: determinism", () => {
  it("gives the same result for the same seed", () => {
    const stages = [stage({ servers: 1, serviceMeanSeconds: 5 })];
    const parties = [spawnParty(1, "stage-a", 0)];
    const a = stepCheckpointNetwork({ elapsedSeconds: 0, parties, seed: 42, stages });
    const b = stepCheckpointNetwork({ elapsedSeconds: 0, parties, seed: 42, stages });
    expect(a).toEqual(b);
  });
});
