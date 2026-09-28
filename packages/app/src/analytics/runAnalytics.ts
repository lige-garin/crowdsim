import {
  baseFloorId,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { resolveDisplayPosition } from "../engine/floorTransferDisplay";
import { fruinLevel, fruinLevels, type FruinLevel } from "./fruinLevelOfService";
import type { SimulationAgent, SimulationSnapshot } from "../engine/simulationEngine";

/**
 * What a run measured, the way pedestrian-analysis tools report it: density and
 * Fruin level of service over time, flow through count lines, journey times,
 * and how long people spent browsing, queuing and being served.
 *
 * It is fed one snapshot at a time (the app samples once a simulated second)
 * and keeps everything for the whole run, so a chart or a CSV export always
 * covers the run rather than a rolling window.
 *
 * Measurement notes, stated where they matter:
 * - Density is people per square metre in a square grid (2 m by default), so a
 *   single person reads 0.25 P/m². Level-of-service shares are over the cells
 *   people occupy at that moment, not over the whole floor.
 * - Crossings are detected between consecutive samples. Someone who crosses a
 *   line and leaves the world before the next sample is not counted.
 * - A person who disappears between samples is taken to have left: a journey
 *   ends at the last sample they were seen in.
 */
export type StayKind = "browse" | "shopQueue" | "counterQueue" | "service";

/** One count line's crossings in one simulated minute — the same tally
 * `csv.flows()` exports, as structured data instead of a CSV string, so a
 * real-observation comparison (`realObservations.ts`) can line it up against
 * imported turnstile/camera counts without round-tripping through text. */
export type MinuteFlow = {
  id: string;
  name: string;
  minuteStartSeconds: number;
  forward: number;
  backward: number;
};

export type RunAnalyticsSummary = {
  elapsedSeconds: number;
  samples: number;
  levelOfService: {
    /** Occupied cells at each level in the latest sample. */
    current: Record<FruinLevel, number>;
    /** Share of occupied cell-samples, over the whole run, at D or worse. */
    shareDOrWorse: number;
    peakDensity: number;
    peakLevel: FruinLevel;
    peakAt: ScenePoint | null;
  };
  flows: {
    id: string;
    name: string;
    forward: number;
    backward: number;
    /** Busiest minute, both directions together, people per minute. */
    peakPerMinute: number;
  }[];
  journeys: {
    count: number;
    meanSeconds: number;
    p50Seconds: number;
    p90Seconds: number;
  };
  places: {
    kind: StayKind;
    placeId: string;
    visits: number;
    p50Seconds: number;
    p90Seconds: number;
    /** Most people in this stay at once (the longest line, for queues). */
    peakConcurrent: number;
  }[];
};

type Tracked = {
  firstSeen: number;
  /** The floor they were on when last sampled (ADR-0010). */
  floorId?: string;
  lastSeen: number;
  x: number;
  y: number;
  stayKey: string | null;
  staySince: number;
};

type Stay = {
  agentId: number;
  kind: StayKind;
  placeId: string;
  start: number;
  end: number;
};

export function createRunAnalytics(options: { cellSizeMeters?: number } = {}) {
  const cellSize = options.cellSizeMeters ?? 2;
  const cellArea = cellSize * cellSize;
  let elapsed = 0;
  let samples = 0;

  const tracked = new Map<number, Tracked>();
  const journeys: { agentId: number; entered: number; left: number }[] = [];
  const stays: Stay[] = [];
  const peakConcurrent = new Map<string, number>();
  /**
   * The per-tick `concurrent` count computed below used to be folded
   * straight into `peakConcurrent` (the running max) and discarded --
   * `places[]` could say "the longest this queue ever got was 6" but never
   * "how long it stayed near 6". Kept as its own series, same growth
   * shape as `losSeries` right below (one entry per `record()` call, for
   * the life of the run) so a queue's length over time can be read back
   * per place via `placeOccupancyOverTime` -- this is what stage 4.2's
   * "排队长度时间带" plan item actually needed and never had the data for.
   */
  const occupancySeries: { t: number; concurrent: Map<string, number> }[] = [];

  const cells = new Map<
    string,
    { floorId?: string; x: number; y: number; sum: number; max: number }
  >();
  const losSeries: { t: number; counts: number[] }[] = [];
  let occupiedCellSamples = 0;
  let dOrWorseCellSamples = 0;
  let peak = { density: 0, at: null as ScenePoint | null };

  const lines = new Map<
    string,
    { name: string; minutes: Map<number, [number, number]> }
  >();

  function closeStay(agentId: number, entry: Tracked, end: number) {
    if (!entry.stayKey) return;
    const [kind, placeId] = splitKey(entry.stayKey);
    stays.push({ agentId, end, kind, placeId, start: entry.staySince });
    entry.stayKey = null;
  }

  function record(scene: CrowdSimScene, snapshot: SimulationSnapshot) {
    const t = snapshot.elapsedSeconds;
    elapsed = t;
    samples++;
    const seen = new Set<number>();
    const concurrent = new Map<string, number>();
    const counts = new Map<string, number>();
    // Every count line is reported, including those nobody has crossed yet.
    for (const line of scene.countLines) {
      if (!lines.has(line.id))
        lines.set(line.id, { minutes: new Map(), name: line.name ?? line.id });
    }

    for (const rawAgent of snapshot.agents) {
      // A rider's own floorId/x/y are the flight's own synthetic id and
      // lane-local coordinates (ADR-0010 stage 5/6, floorTransferDisplay) —
      // resolved once here so density, count lines and dwell tracking below
      // all see the same real floor and door-point position a renderer
      // would, instead of counting them nowhere. This also means the
      // mid-flight switch from the departure floor's display to the
      // arrival floor's counts as a `crossedFloors` jump below, the same as
      // stepping off the connector always did — correct, since it is the
      // same kind of non-walked jump a count line must not tally.
      const agent = { ...rawAgent, ...resolveDisplayPosition(rawAgent) };
      seen.add(agent.id);
      const key = stayKeyOf(agent);
      if (key) concurrent.set(key, (concurrent.get(key) ?? 0) + 1);

      const column = Math.floor(agent.x / cellSize);
      const row = Math.floor(agent.y / cellSize);
      const cellKey = `${agent.floorId ?? ""}|${column},${row}`;
      counts.set(cellKey, (counts.get(cellKey) ?? 0) + 1);

      const previous = tracked.get(agent.id);
      if (!previous) {
        tracked.set(agent.id, {
          firstSeen: t,
          floorId: agent.floorId,
          lastSeen: t,
          stayKey: key,
          staySince: t,
          x: agent.x,
          y: agent.y,
        });
        continue;
      }
      // Stepping off a connector moves someone from one floor to another in
      // one sample. That jump is not a walk across the plan, so it counts for
      // nothing: a line between the two mouths would otherwise tally it.
      const crossedFloors = previous.floorId !== agent.floorId;

      for (const line of scene.countLines) {
        if (crossedFloors || !onSameFloor(scene, line, agent)) continue;
        const direction = crossing(
          previous,
          agent,
          line.geometry.points[0],
          line.geometry.points[1],
        );
        if (direction === 0) continue;
        const tally = lines.get(line.id)!;
        const minute = Math.floor(t / 60);
        const bin = tally.minutes.get(minute) ?? [0, 0];
        bin[direction > 0 ? 0 : 1]++;
        tally.minutes.set(minute, bin);
      }
      if (previous.stayKey !== key) {
        closeStay(agent.id, previous, t);
        previous.stayKey = key;
        previous.staySince = t;
      }
      previous.floorId = agent.floorId;
      previous.lastSeen = t;
      previous.x = agent.x;
      previous.y = agent.y;
    }

    for (const [id, entry] of tracked) {
      if (seen.has(id)) continue;
      closeStay(id, entry, entry.lastSeen);
      journeys.push({ agentId: id, entered: entry.firstSeen, left: entry.lastSeen });
      tracked.delete(id);
    }

    for (const [key, count] of concurrent) {
      peakConcurrent.set(key, Math.max(peakConcurrent.get(key) ?? 0, count));
    }
    // `concurrent` itself, not just its running max -- see occupancySeries's
    // own comment. `concurrent` is a fresh `Map` local to this call (line
    // ~146), so aliasing it directly would be safe today, but copying it
    // costs one small Map clone and makes that safety independent of this
    // function's future internals never mutating it again after this point.
    occupancySeries.push({ t, concurrent: new Map(concurrent) });

    const levelCounts = fruinLevels.map(() => 0);
    for (const [cellKey, count] of counts) {
      const density = count / cellArea;
      const level = fruinLevel(density);
      levelCounts[fruinLevels.indexOf(level)]++;
      occupiedCellSamples++;
      if (fruinLevels.indexOf(level) >= 3) dOrWorseCellSamples++;
      const [floorId, plan] = cellKey.split("|");
      const [column, row] = plan.split(",").map(Number);
      const cell = cells.get(cellKey) ?? {
        floorId: floorId === "" ? undefined : floorId,
        max: 0,
        sum: 0,
        x: column * cellSize,
        y: row * cellSize,
      };
      cell.sum += density;
      cell.max = Math.max(cell.max, density);
      cells.set(cellKey, cell);
      if (density > peak.density) {
        peak = { at: { x: cell.x + cellSize / 2, y: cell.y + cellSize / 2 }, density };
      }
    }
    losSeries.push({ counts: levelCounts, t });
  }

  function summary(): RunAnalyticsSummary {
    const latest = losSeries.at(-1)?.counts ?? fruinLevels.map(() => 0);
    const durations = journeys.map((journey) => journey.left - journey.entered);
    const byPlace = new Map<string, number[]>();
    for (const stay of stays) {
      const key = `${stay.kind}:${stay.placeId}`;
      const list = byPlace.get(key) ?? [];
      list.push(stay.end - stay.start);
      byPlace.set(key, list);
    }
    return {
      elapsedSeconds: elapsed,
      flows: [...lines].map(([id, tally]) => {
        let forward = 0;
        let backward = 0;
        let peakPerMinute = 0;
        for (const [ahead, behind] of tally.minutes.values()) {
          forward += ahead;
          backward += behind;
          peakPerMinute = Math.max(peakPerMinute, ahead + behind);
        }
        return { backward, forward, id, name: tally.name, peakPerMinute };
      }),
      journeys: {
        count: durations.length,
        meanSeconds: durations.length ? sum(durations) / durations.length : 0,
        p50Seconds: percentile(durations, 0.5),
        p90Seconds: percentile(durations, 0.9),
      },
      levelOfService: {
        current: Object.fromEntries(
          fruinLevels.map((level, index) => [level, latest[index]]),
        ) as Record<FruinLevel, number>,
        peakAt: peak.at,
        peakDensity: peak.density,
        peakLevel: fruinLevel(peak.density),
        shareDOrWorse: occupiedCellSamples
          ? dOrWorseCellSamples / occupiedCellSamples
          : 0,
      },
      places: [...byPlace].map(([key, list]) => {
        const [kind, placeId] = splitKey(key);
        return {
          kind,
          p50Seconds: percentile(list, 0.5),
          p90Seconds: percentile(list, 0.9),
          peakConcurrent: peakConcurrent.get(key) ?? 0,
          placeId,
          visits: list.length,
        };
      }),
      samples,
    };
  }

  function minuteFlows(): MinuteFlow[] {
    return [...lines].flatMap(([id, tally]) =>
      [...tally.minutes]
        .sort(([a], [b]) => a - b)
        .map(([minute, [ahead, behind]]) => ({
          backward: behind,
          forward: ahead,
          id,
          minuteStartSeconds: minute * 60,
          name: tally.name,
        })),
    );
  }

  /** Every completed journey's duration in seconds -- the same numbers
   * `summary().journeys`'s P50/P90 are computed from and `csv.journeys()`
   * exports per-agent, as a plain array a chart can bin into a histogram. */
  function journeyDurations(): number[] {
    return journeys.map((journey) => journey.left - journey.entered);
  }

  /**
   * How many people were at `kind`/`placeId` at each recorded second of the
   * run -- e.g. a specific store's `shopQueue`, over time, not just its
   * `summary().places[]` peak. `kind`+`placeId` (not a pre-joined key)
   * matches how a caller already has both fields from a `places[]` row,
   * without needing to know this module's own internal `"kind:placeId"`
   * key format.
   *
   * `windowSamples`, when given, returns only the most recent
   * `windowSamples` entries via `Array.prototype.slice(-windowSamples)` --
   * O(windowSamples), not O(run length so far), unlike mapping the whole
   * `occupancySeries`. This matters because a caller like
   * `RunAnalyticsPanel.tsx` calls this once per queue-kind place on every
   * render while the run is live: without a window, per-render cost grows
   * with elapsed run time (self-reviewed, found by a ponytail-review pass
   * that traced this all the way to "O(elapsed seconds squared) over a
   * run", not just "unbounded array"). One record() call is one sample
   * (this project's own "采样分辨率1仿真秒" convention, same assumption
   * `useRunSeries.ts`'s `chartSeconds` already makes for its own windowed
   * series), so a sample count doubles as an approximate second count.
   *
   * `windowSamples: 0` means "no history", not "unwindowed" -- `slice(-0)`
   * is `slice(0)` (the whole array) because `-0 === 0`, so 0 needs its own
   * branch rather than falling through to the slice (ponytail-review caught
   * this as a currently-unreachable latent bug: the sole real caller always
   * passes a positive constant, but the function's own contract should not
   * depend on that).
   */
  function placeOccupancyOverTime(
    kind: StayKind,
    placeId: string,
    windowSamples?: number,
  ): { t: number; count: number }[] {
    const key = `${kind}:${placeId}`;
    const source =
      windowSamples === undefined
        ? occupancySeries
        : windowSamples <= 0
          ? []
          : occupancySeries.slice(-windowSamples);
    return source.map((sample) => ({
      count: sample.concurrent.get(key) ?? 0,
      t: sample.t,
    }));
  }

  const csv = {
    flows: () =>
      toCsv(
        ["line_id", "line_name", "minute_start_s", "forward", "backward"],
        minuteFlows().map((flow) => [
          flow.id,
          flow.name,
          flow.minuteStartSeconds,
          flow.forward,
          flow.backward,
        ]),
      ),
    journeys: () =>
      toCsv(
        ["agent_id", "entered_s", "left_s", "journey_s"],
        journeys.map((j) => [
          j.agentId,
          round(j.entered),
          round(j.left),
          round(j.left - j.entered),
        ]),
      ),
    stays: () =>
      toCsv(
        ["agent_id", "kind", "place_id", "start_s", "end_s", "duration_s"],
        stays.map((s) => [
          s.agentId,
          s.kind,
          s.placeId,
          round(s.start),
          round(s.end),
          round(s.end - s.start),
        ]),
      ),
    levelOfService: () =>
      toCsv(
        ["time_s", "occupied_cells", ...fruinLevels],
        losSeries.map((entry) => [round(entry.t), sum(entry.counts), ...entry.counts]),
      ),
    densityCells: () =>
      toCsv(
        [
          "cell_x_m",
          "cell_y_m",
          "cell_size_m",
          "mean_density_p_m2",
          "max_density_p_m2",
          "max_los",
          "floor_id",
        ],
        [...cells.values()].map((cell) => [
          cell.x,
          cell.y,
          cellSize,
          round(samples ? cell.sum / samples : 0, 4),
          round(cell.max, 4),
          fruinLevel(cell.max),
          cell.floorId ?? "",
        ]),
      ),
  };

  return {
    csv,
    journeyDurations,
    minuteFlows,
    placeOccupancyOverTime,
    record,
    summary,
  };
}

export type RunAnalytics = ReturnType<typeof createRunAnalytics>;

function stayKeyOf(agent: SimulationAgent): string | null {
  switch (agent.lifecycleState) {
    case "browse":
      return agent.selectedStoreId ? `browse:${agent.selectedStoreId}` : null;
    case "queue":
      return agent.selectedStoreId ? `shopQueue:${agent.selectedStoreId}` : null;
    case "checkout":
      return agent.queueJoinedSeconds !== undefined && agent.servicePointId
        ? `counterQueue:${agent.servicePointId}`
        : null;
    case "enterStore":
      return agent.servicePointId ? `service:${agent.servicePointId}` : null;
    default:
      return null;
  }
}

function splitKey(key: string): [StayKind, string] {
  const at = key.indexOf(":");
  return [key.slice(0, at) as StayKind, key.slice(at + 1)];
}

/**
 * +1 or −1 when the step from `from` to `to` crosses segment a→b, else 0.
 * +1 ("forward") is crossing with b on your left as the plan is drawn
 * (x to the right, y down); −1 is the other way.
 */
/**
 * Whether a walker is on the floor a count line is drawn on. Both resolve an
 * absent floor to the scene's base floor, the same rule the rest of the scene
 * uses (sceneFloors), so a scene with no floors always agrees.
 */
function onSameFloor(
  scene: CrowdSimScene,
  line: { floorId?: string },
  agent: { floorId?: string },
) {
  const base = baseFloorId(scene);

  return (line.floorId ?? base) === (agent.floorId ?? base);
}

export function crossing(
  from: ScenePoint,
  to: ScenePoint,
  a: ScenePoint,
  b: ScenePoint,
) {
  const side = (p: ScenePoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const before = side(from);
  const after = side(to);
  if (before === 0 || after === 0 || before > 0 === after > 0) return 0;
  const moveSide = (p: ScenePoint) =>
    (to.x - from.x) * (p.y - from.y) - (to.y - from.y) * (p.x - from.x);
  if (moveSide(a) > 0 === moveSide(b) > 0) return 0;
  return after > 0 ? 1 : -1;
}

function percentile(values: readonly number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * q;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** RFC 4180 CSV: quote fields that hold commas, quotes or line breaks. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
) {
  const field = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Save text as a file. A BOM so spreadsheet apps read UTF-8 names correctly. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
