import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import type { ObservedLineCount } from "./realObservations";

/**
 * Turning a mall's own gate counts into the arrival curve a run actually
 * spawns people from.
 *
 * This is the one input to a site simulation that can be *measured* rather
 * than inferred, and it is why it gets its own module: every other number
 * that feeds a run (how many flats are nearby, what share of them walk here,
 * what a shop's conversion rate is) is a guess wearing a coat. A door with a
 * people-counter on it is not.
 *
 * What this does with a door that has no counts: **nothing**. It stays on
 * whatever rate the scene already had and is reported as `no-data`. Filling
 * an unmeasured door in from the measured ones would put an inference behind
 * the one number here that was real, and the whole point of this module is
 * that it is not.
 *
 * `forward` is read as entries. A counter that only reports total traffic
 * through a gate is not an entry count — halving it would be a guess, so such
 * data has to be split before it reaches here.
 */

export type ArrivalCalibrationOptions = {
  /** Width of one profile slot, minutes. Default 15. */
  intervalMinutes?: number;
  /**
   * Wall-clock minute, from midnight, that minute 0 of the run stands for.
   * Counts before it are dropped, not shifted into the first slot.
   */
  openAtMinutes?: number;
};

export type DoorCalibration = {
  entranceId: string;
  status: "calibrated" | "no-data";
  /** People counted coming in, over every slot the counts cover. */
  peopleObserved: number;
  /**
   * Minutes the counter actually produced counts for — slots with no count
   * row are not counted here, however far into the run they sit.
   */
  coveredMinutes: number;
  /**
   * Minute of the run the first count lands in. Not always 0: a counter that
   * was switched on an hour after opening would otherwise look like it had
   * measured a quiet first hour.
   */
  startsAtMinutes: number;
  ratesPerMinute: number[];
};

export type ArrivalCalibration = {
  intervalMinutes: number;
  doors: DoorCalibration[];
  peopleObservedTotal: number;
  /**
   * How far into the run the profile reaches, minutes — the last slot that
   * has counts, plus one. A run longer than this goes quiet at the end:
   * `arrivalProfile` spawns nobody past its last slot, and inventing a tail
   * would be exactly the inference this module exists to avoid.
   *
   * Not the same as how much was measured: see `DoorCalibration.coveredMinutes`
   * and `startsAtMinutes`, which together say which minutes inside this range
   * actually had a counter running.
   */
  coverageMinutes: number;
  uncalibratedDoorIds: string[];
};

const defaultIntervalMinutes = 15;

/** Doors people come in by: a `sink` is somewhere they leave. */
function entryDoors(scene: CrowdSimScene) {
  return scene.entrances.filter((entrance) => entrance.kind !== "sink");
}

export function calibrateArrivals(
  scene: CrowdSimScene,
  counts: readonly ObservedLineCount[],
  options: ArrivalCalibrationOptions = {},
): ArrivalCalibration {
  const intervalMinutes = options.intervalMinutes ?? defaultIntervalMinutes;
  const openAtMinutes = options.openAtMinutes ?? 0;

  if (intervalMinutes <= 0) {
    throw new Error(`Profile slot width must be positive, got ${intervalMinutes}`);
  }

  const doors = entryDoors(scene).map((entrance): DoorCalibration => {
    const mine = counts.filter(
      (count) =>
        count.lineId === entrance.id ||
        (entrance.name !== undefined && count.lineName === entrance.name),
    );

    if (mine.length === 0) {
      return {
        entranceId: entrance.id,
        status: "no-data",
        peopleObserved: 0,
        coveredMinutes: 0,
        startsAtMinutes: 0,
        ratesPerMinute: [],
      };
    }

    const slotPeople = new Map<number, number>();

    for (const count of mine) {
      const minute = count.minuteStartSeconds / 60 - openAtMinutes;
      const slot = Math.floor(minute / intervalMinutes);

      // Before opening: dropped rather than piled onto the first slot, which
      // would read as a rush of people the counter never saw.
      if (slot < 0) {
        continue;
      }

      slotPeople.set(slot, (slotPeople.get(slot) ?? 0) + count.forward);
    }

    if (slotPeople.size === 0) {
      return {
        entranceId: entrance.id,
        status: "no-data",
        peopleObserved: 0,
        coveredMinutes: 0,
        startsAtMinutes: 0,
        ratesPerMinute: [],
      };
    }

    const slots = [...slotPeople.keys()];
    const firstSlot = Math.min(...slots);
    const lastSlot = Math.max(...slots);
    const ratesPerMinute = Array.from(
      { length: lastSlot + 1 },
      (_, slot) => (slotPeople.get(slot) ?? 0) / intervalMinutes,
    );
    const peopleObserved = [...slotPeople.values()].reduce(
      (sum, value) => sum + value,
      0,
    );

    return {
      entranceId: entrance.id,
      status: "calibrated",
      peopleObserved,
      // Slots that produced a count row, not the whole span: a counter
      // switched on an hour after opening measured nothing for that hour.
      coveredMinutes: slots.length * intervalMinutes,
      startsAtMinutes: firstSlot * intervalMinutes,
      ratesPerMinute,
    };
  });

  const calibrated = doors.filter((door) => door.status === "calibrated");

  return {
    intervalMinutes,
    doors,
    peopleObservedTotal: calibrated.reduce((sum, door) => sum + door.peopleObserved, 0),
    // How far into the run the profile reaches: one slot per entry, so this
    // is exactly the minute the last slot ends. Deliberately not
    // `coveredMinutes`, which is how much was actually measured — a counter
    // switched on late leaves empty slots inside this range.
    coverageMinutes: calibrated.reduce(
      (max, door) => Math.max(max, door.ratesPerMinute.length * intervalMinutes),
      0,
    ),
    uncalibratedDoorIds: doors
      .filter((door) => door.status === "no-data")
      .map((door) => door.entranceId),
  };
}

/** Write a calibration onto the scene's doors. Unmeasured doors are left alone. */
export function applyArrivalCalibration(
  scene: CrowdSimScene,
  calibration: ArrivalCalibration,
): CrowdSimScene {
  const byDoor = new Map(calibration.doors.map((door) => [door.entranceId, door]));

  return parseScene({
    ...scene,
    entrances: scene.entrances.map((entrance) => {
      const door = byDoor.get(entrance.id);

      if (!door || door.status !== "calibrated") {
        return entrance;
      }

      return {
        ...entrance,
        // The flat rate is what a door falls back to outside the profile. It
        // is the first rate that was actually measured, not the first slot: a
        // counter switched on an hour after opening leaves slot 0 empty, and
        // taking it would write a 0 that reads like a measured quiet hour.
        arrivalRatePerMinute:
          door.ratesPerMinute.find((rate) => rate > 0) ?? entrance.arrivalRatePerMinute,
        arrivalProfile: {
          intervalMinutes: calibration.intervalMinutes,
          ratesPerMinute: door.ratesPerMinute,
        },
      };
    }),
  });
}

/**
 * The calibration as lines someone can check: what was measured, what was
 * not, and how far into a run the measurement reaches.
 */
export function describeArrivalCalibration(calibration: ArrivalCalibration): string[] {
  const lines = [
    `实测到达率：${calibration.doors.filter((d) => d.status === "calibrated").length} 个门有客流计数，` +
      `${calibration.uncalibratedDoorIds.length} 个门没有。`,
    `共 ${round(calibration.peopleObservedTotal)} 人次实测进店客流，` +
      `曲线覆盖跑批前 ${round(calibration.coverageMinutes)} 分钟（每槽 ${calibration.intervalMinutes} 分钟）。`,
  ];

  for (const door of calibration.doors) {
    if (door.status === "no-data") {
      lines.push(
        `- ${door.entranceId}：无实测数据，沿用场景原有到达率（未做任何推测填补）`,
      );
      continue;
    }

    const peak = Math.max(...door.ratesPerMinute);
    const late =
      door.startsAtMinutes > 0
        ? `，从第 ${round(door.startsAtMinutes)} 分钟才有数`
        : "";
    lines.push(
      `- ${door.entranceId}：实测 ${round(door.peopleObserved)} 人次，` +
        `峰值 ${round(peak)} 人/分钟，实际有数 ${round(door.coveredMinutes)} 分钟${late}`,
    );
  }

  const quiet = calibration.doors.filter(
    (door) =>
      door.status === "calibrated" && door.ratesPerMinute.some((rate) => rate === 0),
  );

  if (quiet.length > 0) {
    lines.push(
      `注意：${quiet.length} 个门的曲线里有空槽（计数器没在跑的那几分钟不生成人），` +
        `跑批前段可能空场——这不是「客流为 0」，是「没有数据」。`,
    );
  }

  if (calibration.uncalibratedDoorIds.length > 0) {
    lines.push(
      "注意：没有计数的门用的是场景原有数值，两个门的到达率来源不同，横向比较不成立。",
    );
  }

  return lines;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
