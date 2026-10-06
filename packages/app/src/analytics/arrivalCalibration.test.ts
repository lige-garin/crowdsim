import { describe, expect, it } from "vitest";
import { deriveSceneGeometry } from "../engine/simulationSceneConfig";
import { createMallSkeleton } from "../scenes/mallSkeleton";
import {
  applyArrivalCalibration,
  calibrateArrivals,
  describeArrivalCalibration,
  type ArrivalCalibration,
} from "./arrivalCalibration";
import { parseLineCountObservationsCsv } from "./realObservations";

const mall = createMallSkeleton({
  id: "calib-mall",
  name: "Calib Mall",
  world: { width: 60, height: 40 },
  atrium: { x: 30, y: 20 },
  floors: [
    {
      id: "l1",
      level: 0,
      zones: [{ category: "fashion", rect: { x: 6, y: 8, width: 30, height: 14 } }],
    },
  ],
});

const door1 = "door-1";
const door2 = "door-2";

/** One count row per minute: `forward` is people coming in. */
function counts(rows: [string, number, number][]) {
  const csv = [
    "line_id,minute_start_s,forward,backward",
    ...rows.map(([id, minute, forward]) => `${id},${minute * 60},${forward},0`),
  ].join("\n");

  return parseLineCountObservationsCsv(csv);
}

describe("arrival calibration", () => {
  it("turns per-minute gate counts into a per-slot rate", () => {
    // 60 people over the first 15 minutes = 4 a minute; 30 over the next.
    const calibration = calibrateArrivals(
      mall,
      counts([
        [door1, 0, 4],
        [door1, 14, 4],
        [door1, 15, 2],
      ]),
      { intervalMinutes: 15 },
    );

    const door = calibration.doors.find((candidate) => candidate.entranceId === door1);

    expect(door?.status).toBe("calibrated");
    // Two minutes sampled in slot 0 at 4 each, one in slot 1 at 2.
    expect(door?.ratesPerMinute).toEqual([8 / 15, 2 / 15]);
    expect(door?.peopleObserved).toBe(10);
    expect(door?.coveredMinutes).toBe(30);
    expect(calibration.coverageMinutes).toBe(30);
  });

  it("leaves a door with no counts alone instead of filling it in", () => {
    const calibration = calibrateArrivals(mall, counts([[door1, 0, 4]]), {
      intervalMinutes: 15,
    });

    expect(calibration.uncalibratedDoorIds).toEqual([door2]);
    expect(
      calibration.doors.find((d) => d.entranceId === door2)?.ratesPerMinute,
    ).toEqual([]);

    const applied = applyArrivalCalibration(mall, calibration);
    const untouched = applied.entrances.find((entrance) => entrance.id === door2);

    expect(untouched?.arrivalProfile).toBeUndefined();
    expect(untouched?.arrivalRatePerMinute).toBe(
      mall.entrances.find((entrance) => entrance.id === door2)?.arrivalRatePerMinute,
    );
  });

  it("writes a profile only on the doors that were measured", () => {
    const calibration = calibrateArrivals(
      mall,
      counts([
        [door1, 0, 5],
        [door2, 0, 3],
      ]),
      { intervalMinutes: 15 },
    );
    const applied = applyArrivalCalibration(mall, calibration);

    for (const id of [door1, door2]) {
      const entrance = applied.entrances.find((candidate) => candidate.id === id);
      expect(entrance?.arrivalProfile?.intervalMinutes).toBe(15);
      expect(entrance?.arrivalProfile?.ratesPerMinute).toHaveLength(1);
    }
    // Sinks are not doors people arrive at, so they gain nothing.
    expect(
      applied.entrances
        .filter((entrance) => entrance.kind === "sink")
        .every((entrance) => entrance.arrivalProfile === undefined),
    ).toBe(true);
  });

  it("counts only the minutes it actually has counts for", () => {
    // The regression: coverage used to be "up to the last slot that had a
    // count", so a door whose counter only started at minute 80 reported 90
    // minutes of coverage while 75 of them had no data and spawned nobody.
    const late = calibrateArrivals(mall, counts([[door1, 80, 10]]), {
      intervalMinutes: 15,
    });
    const door = late.doors.find((candidate) => candidate.entranceId === door1);

    expect(door?.coveredMinutes).toBe(15);
    expect(door?.startsAtMinutes).toBe(75);
    expect(late.coverageMinutes).toBe(90);
  });

  it("does not write a zero flat rate onto a door whose first slot is empty", () => {
    // The comment on the write used to claim a door is never left at 0; the
    // code did exactly that whenever the first slot held no counts.
    const late = calibrateArrivals(mall, counts([[door1, 80, 10]]), {
      intervalMinutes: 15,
    });
    const applied = applyArrivalCalibration(mall, late);
    const entrance = applied.entrances.find((candidate) => candidate.id === door1);

    expect(entrance?.arrivalRatePerMinute).toBeGreaterThan(0);
  });

  it("shifts counts by the opening time rather than piling them on minute 0", () => {
    const midday = 600; // 10:00
    const calibration = calibrateArrivals(
      mall,
      counts([
        [door1, midday - 5, 9], // before opening: dropped
        [door1, midday + 1, 9],
      ]),
      { intervalMinutes: 15, openAtMinutes: midday },
    );
    const door = calibration.doors.find((candidate) => candidate.entranceId === door1);

    expect(door?.peopleObserved).toBe(9);
    expect(door?.ratesPerMinute).toEqual([9 / 15]);
  });

  it("counts a door whose data all fell before opening as unmeasured", () => {
    const calibration = calibrateArrivals(mall, counts([[door1, 0, 9]]), {
      intervalMinutes: 15,
      openAtMinutes: 600,
    });

    expect(calibration.doors.find((d) => d.entranceId === door1)?.status).toBe(
      "no-data",
    );
    expect(calibration.uncalibratedDoorIds).toContain(door1);
  });

  it("rejects a slot width it cannot divide a run into", () => {
    expect(() =>
      calibrateArrivals(mall, counts([[door1, 0, 1]]), { intervalMinutes: 0 }),
    ).toThrow(/positive/);
  });

  it("is a profile the engine actually spawns from, not just a field it accepts", () => {
    const calibration = calibrateArrivals(mall, counts([[door1, 0, 6]]), {
      intervalMinutes: 15,
    });
    const applied = applyArrivalCalibration(mall, calibration);
    const geometry = deriveSceneGeometry(applied, {}, () => 0.5);
    const source = geometry.sources.find((candidate) => candidate.id === door1);

    expect(source?.arrivalProfile?.intervalSeconds).toBe(900);
    expect(source?.arrivalProfile?.ratesPerSecond[0]).toBeCloseTo(6 / 15 / 60, 9);
  });

  it("matches a counter by door name when the ids do not agree", () => {
    const named = parseLineCountObservationsCsv(
      ["line_id,line_name,minute_start_s,forward,backward", "g7,Door 1,0,6,0"].join(
        "\n",
      ),
    );
    const calibration = calibrateArrivals(mall, named, { intervalMinutes: 15 });
    const door = calibration.doors.find((candidate) => candidate.entranceId === door1);

    expect(door?.status).toBe("calibrated");
  });
});

describe("describeArrivalCalibration", () => {
  const calibration: ArrivalCalibration = {
    intervalMinutes: 15,
    doors: [
      {
        entranceId: door1,
        status: "calibrated",
        peopleObserved: 120,
        coveredMinutes: 60,
        startsAtMinutes: 0,
        ratesPerMinute: [4, 4, 3, 1],
      },
      {
        entranceId: door2,
        status: "no-data",
        peopleObserved: 0,
        coveredMinutes: 0,
        startsAtMinutes: 0,
        ratesPerMinute: [],
      },
    ],
    peopleObservedTotal: 120,
    coverageMinutes: 60,
    uncalibratedDoorIds: [door2],
  };

  it("says how many doors were measured and how many were not", () => {
    const lines = describeArrivalCalibration(calibration);

    expect(lines[0]).toContain("1 个门有客流计数");
    expect(lines[0]).toContain("1 个门没有");
    expect(lines[1]).toContain("120 人次");
    expect(lines[1]).toContain("60 分钟");
  });

  it("names the unmeasured doors rather than letting them pass for measured", () => {
    const lines = describeArrivalCalibration(calibration);

    expect(lines.some((line) => line.includes(`${door2}：无实测数据`))).toBe(true);
    expect(lines.some((line) => line.includes("横向比较不成立"))).toBe(true);
  });
});
