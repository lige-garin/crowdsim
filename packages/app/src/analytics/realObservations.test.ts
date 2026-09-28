import { describe, expect, it } from "vitest";
import {
  compareLineCounts,
  comparePosReceipts,
  parseLineCountObservationsCsv,
  parseReceiptTimestampsCsv,
  summarizeLineCountComparison,
  type ObservedLineCount,
} from "./realObservations";
import type { MinuteFlow, RunAnalyticsSummary } from "./runAnalytics";

describe("parseLineCountObservationsCsv", () => {
  it("parses this project's own flows export column shape", () => {
    const csv = [
      "line_id,line_name,minute_start_s,forward,backward",
      "main-entrance,Main entrance,0,12,3",
      "main-entrance,Main entrance,60,15,4",
    ].join("\n");

    expect(parseLineCountObservationsCsv(csv)).toEqual([
      {
        backward: 3,
        forward: 12,
        lineId: "main-entrance",
        lineName: "Main entrance",
        minuteStartSeconds: 0,
      },
      {
        backward: 4,
        forward: 15,
        lineId: "main-entrance",
        lineName: "Main entrance",
        minuteStartSeconds: 60,
      },
    ]);
  });

  it("accepts common turnstile/camera export aliases, and a name-only row", () => {
    const csv = ["gate_name,timestamp_s,in,out", "North gate,0,7,1"].join("\n");

    const [row] = parseLineCountObservationsCsv(csv);
    expect(row.lineId).toBe("North gate");
    expect(row.lineName).toBe("North gate");
    expect(row.forward).toBe(7);
    expect(row.backward).toBe(1);
  });

  it("throws when neither a line id nor a line name column is present", () => {
    expect(() =>
      parseLineCountObservationsCsv("minute_start_s,forward,backward\n0,1,1"),
    ).toThrow(/missing 'line_id' or 'line_name' column/);
  });

  it("throws a row-numbered error for a malformed count", () => {
    expect(() =>
      parseLineCountObservationsCsv(
        "line_id,minute_start_s,forward,backward\nA,0,not-a-number,0",
      ),
    ).toThrow(/row 2 has invalid forward value/);
  });

  it("skips blank rows", () => {
    const csv = "line_id,minute_start_s,forward,backward\nA,0,1,0\n\n   \n";
    expect(parseLineCountObservationsCsv(csv)).toHaveLength(1);
  });
});

describe("parseReceiptTimestampsCsv", () => {
  it("parses place id and timestamp columns", () => {
    const csv = ["place_id,timestamp_s", "shop-1,12.5", "shop-1,40", "shop-2,9"].join(
      "\n",
    );
    expect(parseReceiptTimestampsCsv(csv)).toEqual([
      { placeId: "shop-1", timestampSeconds: 12.5 },
      { placeId: "shop-1", timestampSeconds: 40 },
      { placeId: "shop-2", timestampSeconds: 9 },
    ]);
  });

  it("throws when the place id column is missing", () => {
    expect(() => parseReceiptTimestampsCsv("timestamp_s\n1")).toThrow(
      /missing 'place_id' column/,
    );
  });
});

describe("compareLineCounts", () => {
  const simulated: MinuteFlow[] = [
    { backward: 2, forward: 10, id: "l1", minuteStartSeconds: 0, name: "Line 1" },
    { backward: 3, forward: 8, id: "l1", minuteStartSeconds: 60, name: "Line 1" },
  ];

  it("matches an observed minute to its simulated counterpart by id", () => {
    const observed: ObservedLineCount[] = [
      {
        backward: 1,
        forward: 11,
        lineId: "l1",
        lineName: "Line 1",
        minuteStartSeconds: 0,
      },
    ];

    const rows = compareLineCounts(observed, simulated);
    const matched = rows.find((row) => row.minuteStartSeconds === 0)!;
    expect(matched.observedForward).toBe(11);
    expect(matched.simulatedForward).toBe(10);

    const unmatched = rows.find((row) => row.minuteStartSeconds === 60)!;
    expect(unmatched.observedForward).toBeNull();
    expect(unmatched.simulatedForward).toBe(8);
  });

  it("falls back to matching by name when a real dataset doesn't know the scene's internal line id", () => {
    const observed: ObservedLineCount[] = [
      {
        backward: 1,
        forward: 11,
        lineId: "Line 1",
        lineName: "Line 1",
        minuteStartSeconds: 0,
      },
    ];

    const rows = compareLineCounts(observed, simulated);
    expect(rows.find((row) => row.minuteStartSeconds === 0)?.observedForward).toBe(11);
  });

  it("keeps an observed-only minute, with simulated left null", () => {
    const observed: ObservedLineCount[] = [
      {
        backward: 0,
        forward: 5,
        lineId: "l1",
        lineName: "Line 1",
        minuteStartSeconds: 120,
      },
    ];

    const rows = compareLineCounts(observed, simulated);
    const extra = rows.find((row) => row.minuteStartSeconds === 120)!;
    expect(extra.observedForward).toBe(5);
    expect(extra.simulatedForward).toBeNull();
  });
});

describe("summarizeLineCountComparison", () => {
  it("computes mean absolute error only over minutes present on both sides", () => {
    const rows = compareLineCounts(
      [
        {
          backward: 2,
          forward: 10,
          lineId: "l1",
          lineName: "L1",
          minuteStartSeconds: 0,
        },
        {
          backward: 0,
          forward: 4,
          lineId: "l1",
          lineName: "L1",
          minuteStartSeconds: 120,
        },
      ],
      [
        { backward: 3, forward: 12, id: "l1", minuteStartSeconds: 0, name: "L1" },
        { backward: 1, forward: 6, id: "l1", minuteStartSeconds: 60, name: "L1" },
      ],
    );
    const summary = summarizeLineCountComparison(rows);

    // minute 0: |10-12| + |2-3| = 3, matched
    // minute 60: simulated-only
    // minute 120: observed-only
    expect(summary.matchedMinutes).toBe(1);
    expect(summary.observedOnlyMinutes).toBe(1);
    expect(summary.simulatedOnlyMinutes).toBe(1);
    expect(summary.meanAbsoluteError).toBeCloseTo(1.5, 5); // 3 / (1 matched * 2 directions)
    expect(summary.totalObserved).toBe(16); // 10+2+4+0
    expect(summary.totalSimulated).toBe(22); // 12+3+6+1
  });

  it("reports zero error for no rows", () => {
    expect(summarizeLineCountComparison([]).meanAbsoluteError).toBe(0);
  });
});

describe("comparePosReceipts", () => {
  const simulatedPlaces: RunAnalyticsSummary["places"] = [
    {
      kind: "service",
      p50Seconds: 10,
      p90Seconds: 20,
      peakConcurrent: 1,
      placeId: "shop-1",
      visits: 30,
    },
    {
      kind: "browse",
      p50Seconds: 5,
      p90Seconds: 8,
      peakConcurrent: 2,
      placeId: "shop-1",
      visits: 100,
    },
  ];

  it("counts observed transactions per place against the run's total service visits", () => {
    const rows = comparePosReceipts(
      [
        { placeId: "shop-1", timestampSeconds: 1 },
        { placeId: "shop-1", timestampSeconds: 2 },
        { placeId: "shop-2", timestampSeconds: 3 },
      ],
      simulatedPlaces,
    );

    const shop1 = rows.find((row) => row.placeId === "shop-1")!;
    expect(shop1.observedTransactions).toBe(2);
    expect(shop1.simulatedServiceVisits).toBe(30);

    const shop2 = rows.find((row) => row.placeId === "shop-2")!;
    expect(shop2.observedTransactions).toBe(1);
    expect(shop2.simulatedServiceVisits).toBeNull();
  });

  it("ignores non-service (browse/queue) place kinds when matching", () => {
    const rows = comparePosReceipts([], simulatedPlaces);
    // shop-1 only appears once (from the service row), not twice (browse ignored)
    expect(rows.filter((row) => row.placeId === "shop-1")).toHaveLength(1);
  });
});
