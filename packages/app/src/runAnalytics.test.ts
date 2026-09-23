import { parseScene } from "@crowdsim/scene-schema";
import { describe, expect, it } from "vitest";
import { fruinDensityBreaks, fruinLevel } from "./fruinLevelOfService";
import { createRunAnalytics, crossing, toCsv } from "./runAnalytics";
import type { SimulationAgent, SimulationSnapshot } from "./simulationEngine";

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "analytics",
  name: "Analytics",
  world: { width: 40, height: 20 },
  countLines: [
    {
      id: "gate",
      name: "Main gate",
      geometry: {
        type: "polyline",
        points: [
          { x: 20, y: 0 },
          { x: 20, y: 20 },
        ],
      },
    },
  ],
});

const person = (overrides: Partial<SimulationAgent>): SimulationAgent => ({
  id: 1,
  targetX: 0,
  targetY: 0,
  vx: 0,
  vy: 0,
  x: 0,
  y: 0,
  ...overrides,
});

const at = (elapsedSeconds: number, agents: SimulationAgent[]): SimulationSnapshot => ({
  agentCount: agents.length,
  agents,
  elapsedSeconds,
  exitedCount: 0,
  spawnedCount: agents.length,
  status: "running",
  stepCount: 0,
  timeScale: 1,
});

describe("Fruin level of service", () => {
  it("bands walkway density at Fruin's area-per-person limits", () => {
    const breaks = fruinDensityBreaks("walkway");
    // 35 ft² per person is 3.25 m², i.e. 0.31 people per m².
    expect(breaks[0]).toBeCloseTo(0.3075, 3);
    expect(fruinLevel(0.3)).toBe("A");
    expect(fruinLevel(0.4)).toBe("B");
    expect(fruinLevel(0.6)).toBe("C");
    expect(fruinLevel(1)).toBe("D");
    expect(fruinLevel(2)).toBe("E");
    expect(fruinLevel(2.5)).toBe("F");
  });

  it("uses the tighter queuing bands for people standing in line", () => {
    expect(fruinLevel(1, "queuing")).toBe("B");
    expect(fruinLevel(1, "walkway")).toBe("D");
  });
});

describe("crossing", () => {
  const a = { x: 20, y: 0 };
  const b = { x: 20, y: 20 };

  it("tells the two directions apart and ignores steps that pass the line's end", () => {
    expect(crossing({ x: 19, y: 5 }, { x: 21, y: 5 }, a, b)).not.toBe(0);
    expect(crossing({ x: 19, y: 5 }, { x: 21, y: 5 }, a, b)).toBe(
      -crossing({ x: 21, y: 5 }, { x: 19, y: 5 }, a, b),
    );
    expect(crossing({ x: 19, y: 25 }, { x: 21, y: 25 }, a, b)).toBe(0);
    expect(crossing({ x: 18, y: 5 }, { x: 19, y: 5 }, a, b)).toBe(0);
  });
});

describe("createRunAnalytics", () => {
  it("counts line crossings by direction and minute", () => {
    const analytics = createRunAnalytics();
    analytics.record(
      scene,
      at(1, [person({ id: 1, x: 18, y: 5 }), person({ id: 2, x: 22, y: 8 })]),
    );
    analytics.record(
      scene,
      at(2, [person({ id: 1, x: 21, y: 5 }), person({ id: 2, x: 19, y: 8 })]),
    );
    analytics.record(
      scene,
      at(3, [person({ id: 1, x: 23, y: 5 }), person({ id: 2, x: 17, y: 8 })]),
    );

    const [gate] = analytics.summary().flows;
    expect(gate).toMatchObject({ id: "gate", name: "Main gate" });
    expect(gate.forward + gate.backward).toBe(2);
    expect(gate.forward).toBe(1);
    expect(gate.peakPerMinute).toBe(2);
    expect(analytics.csv.flows()).toContain("gate,Main gate,0,");
  });

  it("measures journeys and stays, and the longest line at a shop", () => {
    const analytics = createRunAnalytics();
    analytics.record(scene, at(0, [person({ id: 1 }), person({ id: 2 })]));
    analytics.record(
      scene,
      at(10, [
        person({ id: 1, lifecycleState: "browse", selectedStoreId: "cafe" }),
        person({ id: 2, lifecycleState: "queue", selectedStoreId: "cafe" }),
      ]),
    );
    analytics.record(
      scene,
      at(40, [
        person({ id: 1, lifecycleState: "leave" }),
        person({ id: 2, lifecycleState: "browse", selectedStoreId: "cafe" }),
      ]),
    );
    analytics.record(scene, at(60, [person({ id: 2, lifecycleState: "leave" })]));
    analytics.record(scene, at(61, []));

    const summary = analytics.summary();
    expect(summary.journeys.count).toBe(2);
    expect(summary.journeys.p50Seconds).toBeCloseTo(50);
    const browse = summary.places.find((place) => place.kind === "browse")!;
    expect(browse).toMatchObject({ placeId: "cafe", visits: 2 });
    const queue = summary.places.find((place) => place.kind === "shopQueue")!;
    expect(queue).toMatchObject({ p50Seconds: 30, peakConcurrent: 1, visits: 1 });
    expect(analytics.csv.stays().split("\r\n")[0]).toBe(
      "agent_id,kind,place_id,start_s,end_s,duration_s",
    );
  });

  it("exposes each completed journey's raw duration, matching the summary's percentiles", () => {
    // Same record sequence as "measures journeys and stays" above: agent 1's
    // last-seen sample is t=40 (gone by t=60, duration 40s), agent 2's is
    // t=60 (gone by t=61, duration 60s) -- which is where that test's
    // p50Seconds ≈ 50 (the median of [40, 60]) comes from.
    const analytics = createRunAnalytics();
    analytics.record(scene, at(0, [person({ id: 1 }), person({ id: 2 })]));
    analytics.record(
      scene,
      at(10, [
        person({ id: 1, lifecycleState: "browse", selectedStoreId: "cafe" }),
        person({ id: 2, lifecycleState: "queue", selectedStoreId: "cafe" }),
      ]),
    );
    analytics.record(
      scene,
      at(40, [
        person({ id: 1, lifecycleState: "leave" }),
        person({ id: 2, lifecycleState: "browse", selectedStoreId: "cafe" }),
      ]),
    );
    analytics.record(scene, at(60, [person({ id: 2, lifecycleState: "leave" })]));
    analytics.record(scene, at(61, []));

    expect(analytics.journeyDurations().sort((a, b) => a - b)).toEqual([40, 60]);
    expect(analytics.summary().journeys.count).toBe(
      analytics.journeyDurations().length,
    );
  });

  it("rates crowding by Fruin level in 2 m cells", () => {
    const analytics = createRunAnalytics();
    // Three people in one 4 m² cell: 0.75 P/m², level D.
    analytics.record(
      scene,
      at(1, [
        person({ id: 1, x: 1, y: 1 }),
        person({ id: 2, x: 1.5, y: 1 }),
        person({ id: 3, x: 1, y: 1.5 }),
        person({ id: 4, x: 30, y: 10 }),
      ]),
    );

    const { levelOfService } = analytics.summary();
    expect(levelOfService.current.D).toBe(1);
    expect(levelOfService.current.A).toBe(1);
    expect(levelOfService.peakLevel).toBe("D");
    expect(levelOfService.shareDOrWorse).toBeCloseTo(0.5);
    expect(analytics.csv.levelOfService()).toContain("1,2,1,0,0,1,0,0");
  });
});

describe("toCsv", () => {
  it("quotes fields holding commas, quotes or line breaks", () => {
    expect(toCsv(["a", "b"], [["plain", 'say "hi", ok']])).toBe(
      'a,b\r\nplain,"say ""hi"", ok"\r\n',
    );
  });
});

describe("measuring a building with floors", () => {
  const stacked = parseScene({
    schemaVersion: "1.0.0",
    name: "Measured stack",
    world: { width: 60, height: 40 },
    id: "measured-stack",
    floors: [
      { id: "ground", level: 0, elevationMeters: 0 },
      { id: "upper", level: 1, elevationMeters: 4.5 },
    ],
    countLines: [
      {
        id: "ground-line",
        floorId: "ground",
        geometry: {
          type: "polyline",
          points: [
            { x: 30, y: 10 },
            { x: 30, y: 30 },
          ],
        },
      },
    ],
  });

  function at(floorId: string, x: number, id = 1) {
    return {
      agentCount: 1,
      agents: [{ id, floorId, x, y: 20, vx: 0, vy: 0, targetX: x, targetY: 20 }],
      elapsedSeconds: 0,
      exitedCount: 0,
      spawnedCount: 1,
      status: "running" as const,
      stepCount: 0,
      timeScale: 1,
    };
  }

  it("does not count someone walking over the line on another floor", () => {
    const analytics = createRunAnalytics();
    analytics.record(stacked, { ...at("upper", 25), elapsedSeconds: 0 });
    analytics.record(stacked, { ...at("upper", 35), elapsedSeconds: 1 });

    const counts = analytics.summary().flows[0];

    expect(counts.forward + counts.backward).toBe(0);
  });

  it("counts someone walking over it on its own floor", () => {
    const analytics = createRunAnalytics();
    analytics.record(stacked, { ...at("ground", 25), elapsedSeconds: 0 });
    analytics.record(stacked, { ...at("ground", 35), elapsedSeconds: 1 });

    const counts = analytics.summary().flows[0];

    expect(counts.forward + counts.backward).toBe(1);
  });

  it("keeps the density of one floor out of the density of another", () => {
    const analytics = createRunAnalytics();
    const together = {
      ...at("ground", 20),
      agentCount: 2,
      agents: [
        {
          id: 1,
          floorId: "ground",
          x: 20,
          y: 20,
          vx: 0,
          vy: 0,
          targetX: 20,
          targetY: 20,
        },
        {
          id: 2,
          floorId: "upper",
          x: 20,
          y: 20,
          vx: 0,
          vy: 0,
          targetX: 20,
          targetY: 20,
        },
      ],
    };

    analytics.record(stacked, together);

    // Two people over the same spot on different floors are one person per
    // floor, not two in one cell.
    expect(analytics.summary().levelOfService.peakDensity).toBeCloseTo(1 / 4, 6);
  });
});
