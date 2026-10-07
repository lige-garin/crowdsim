import { describe, expect, it } from "vitest";
import { createMallSkeleton } from "../scenes/mallSkeleton";
import { applyShopLayoutToLot } from "../scenes/shopLayout";
import {
  compareScenarioMeasures,
  describeComparison,
  describeDelta,
  measureScenario,
} from "./layoutComparison";

const mall = createMallSkeleton({
  id: "compare-mall",
  name: "Compare Mall",
  world: { width: 60, height: 40 },
  atrium: { x: 30, y: 20 },
  floors: [
    {
      id: "l1",
      level: 0,
      zones: [
        {
          category: "dining",
          // A short dwell on purpose: the run below has to be long enough for
          // someone to walk in, sit a while and reach an exit, or every
          // journey measure is measuring a crowd that never left.
          dwellMeanSeconds: 40,
          rect: { x: 6, y: 8, width: 30, height: 14 },
        },
      ],
    },
  ],
});

const lot = mall.storeLots[0];
const spec = { lot: { x: 0, y: 0, width: 18, height: 14 } };

/** Short, so the suite stays quick; long enough for people to get through. */
const run = { durationSeconds: 120, sampleEverySeconds: 1 };

describe("scenario comparison", () => {
  it("measures a run", () => {
    const scene = applyShopLayoutToLot(mall, lot.id, {
      ...spec,
      tables: { fourSeat: 6 },
    });
    const measures = measureScenario(scene, "sparse", run);

    expect(measures.id).toBe("sparse");
    expect(measures.seed).toBe(scene.seed);
    expect(measures.elapsedSeconds).toBeGreaterThan(0);
    expect(measures.peakQueueLength).toBeGreaterThanOrEqual(0);
    // If nobody ever goes in, every comparison below is comparing zeroes.
    expect(measures.storeVisits).toBeGreaterThan(0);
    expect(measures.throughputPerMinute).toBeGreaterThan(0);
  }, 60_000);

  it("is deterministic, or a comparison would be measuring the random stream", () => {
    const scene = applyShopLayoutToLot(mall, lot.id, {
      ...spec,
      tables: { fourSeat: 6 },
    });

    const first = measureScenario(scene, "a", run);
    const second = measureScenario(scene, "b", run);

    expect(second.peakQueueLength).toBe(first.peakQueueLength);
    expect(second.storeVisits).toBe(first.storeVisits);
    expect(second.peakDensity).toBe(first.peakDensity);
    expect(second.throughputPerMinute).toBe(first.throughputPerMinute);
  }, 60_000);

  it("refuses to compare runs of different lengths", () => {
    // Every absolute measure here grows with the run: a 300 s run has more
    // visits and a higher throughput than a 120 s one for reasons that have
    // nothing to do with the layout. Comparing them anyway would report that
    // growth as a design difference.
    const short = measureScenario(
      applyShopLayoutToLot(mall, lot.id, { ...spec, tables: { fourSeat: 6 } }),
      "short",
      run,
    );
    const long = measureScenario(
      applyShopLayoutToLot(mall, lot.id, { ...spec, tables: { fourSeat: 6 } }),
      "long",
      { ...run, durationSeconds: 240 },
    );

    expect(() => compareScenarioMeasures(short, [long])).toThrow(/longer run/);
  }, 60_000);

  it("refuses to compare scenes with different seeds", () => {
    const sparse = measureScenario(
      applyShopLayoutToLot(mall, lot.id, { ...spec, tables: { fourSeat: 6 } }),
      "sparse",
      run,
    );
    const otherSeed = measureScenario(
      applyShopLayoutToLot({ ...mall, seed: mall.seed + 1 }, lot.id, {
        ...spec,
        tables: { fourSeat: 6 },
      }),
      "other",
      run,
    );

    expect(() => compareScenarioMeasures(sparse, [otherSeed])).toThrow(
      /different seeds/,
    );
  }, 60_000);

  it("reports every measure as a delta, not just a value", () => {
    const sparse = measureScenario(
      applyShopLayoutToLot(mall, lot.id, { ...spec, tables: { fourSeat: 2 } }),
      "sparse",
      run,
    );
    const dense = measureScenario(
      applyShopLayoutToLot(mall, lot.id, {
        ...spec,
        tables: { fourSeat: 10, sixSeat: 4, privateRoom10: 1 },
      }),
      "dense",
      run,
    );

    const comparison = compareScenarioMeasures(sparse, [dense]);

    expect(comparison.baseline.id).toBe("sparse");
    expect(comparison.variants).toHaveLength(1);
    expect(comparison.variants[0]?.deltas.map((d) => d.measure)).toEqual([
      "peakQueueLength",
      "storeVisits",
      "medianStoreStaySeconds",
      "peakDensity",
      "congestionShare",
      "throughputPerMinute",
      "meanJourneySeconds",
    ]);

    for (const entry of comparison.variants[0]?.deltas ?? []) {
      expect(entry.change).toBe(entry.variant - entry.baseline);
      expect(entry.changeRatio).toBe(
        entry.baseline === 0 ? null : entry.change / entry.baseline,
      );
    }
  }, 60_000);
});

describe("describeDelta", () => {
  it("phrases a change as a percentage and a direction", () => {
    const comparison = compareScenarioMeasures(
      {
        id: "a",
        seed: 1,
        elapsedSeconds: 90,
        peakQueueLength: 10,
        storeVisits: 20,
        medianStoreStaySeconds: 100,
        peakDensity: 2,
        congestionShare: 0.2,
        throughputPerMinute: 30,
        meanJourneySeconds: 60,
      },
      [
        {
          id: "b",
          seed: 1,
          elapsedSeconds: 90,
          peakQueueLength: 6,
          storeVisits: 24,
          medianStoreStaySeconds: 90,
          peakDensity: 1.5,
          congestionShare: 0.1,
          throughputPerMinute: 36,
          meanJourneySeconds: 54,
        },
      ],
    );

    const queue = comparison.variants[0]?.deltas[0];
    expect(queue).toBeDefined();
    expect(describeDelta(queue!)).toBe("最长排队：-40%（10 → 6，更好）");
  });

  it("does not round a real change down to 0% and call it a direction", () => {
    // -0.4% used to print as "0%（10 → 9.96，更差）", which reads like nothing
    // changed while still claiming a direction.
    expect(
      describeDelta({
        measure: "peakQueueLength",
        baseline: 10,
        variant: 9.96,
        change: -0.04,
        changeRatio: -0.004,
        moreIsBetter: false,
      }),
    ).toContain("基本持平");
  });

  it("says so instead of inventing a ratio when the baseline is zero", () => {
    expect(
      describeDelta({
        measure: "storeVisits",
        baseline: 0,
        variant: 5,
        change: 5,
        changeRatio: null,
        moreIsBetter: true,
      }),
    ).toBe("进店人次：0 → 5（基线为 0，不给百分比）");
  });

  it("leads a report with the caveat, not with the numbers", () => {
    const sparse = measureScenario(
      applyShopLayoutToLot(mall, lot.id, { ...spec, tables: { fourSeat: 2 } }),
      "sparse",
      run,
    );
    const dense = measureScenario(
      applyShopLayoutToLot(mall, lot.id, {
        ...spec,
        tables: { fourSeat: 10, sixSeat: 4, privateRoom10: 1 },
      }),
      "dense",
      run,
    );
    const lines = describeComparison(compareScenarioMeasures(sparse, [dense]));

    // The caveat is the first line, not a footnote under the numbers.
    expect(lines[0]).toContain("绝对数值不可用于预测");
    expect(lines[1]).toContain("基线「sparse」");
    expect(lines.some((line) => line.includes("方案「dense」"))).toBe(true);
    expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(7);
  }, 60_000);
});
