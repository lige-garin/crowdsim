import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { SimulationAgent } from "../engine/simulationEngine";
import { createSimulationEngineFromScene } from "../engine/simulationEngine";
import type { SimulationEngineConfig } from "../engine/simulationEngine";
import { createRunAnalytics } from "./runAnalytics";

/**
 * Comparing two layouts, or two candidate lots, by running each one.
 *
 * The whole point is the *difference* between two runs, not the absolute
 * number either run produces. An arrival rate inferred from surrounding POIs
 * is not calibrated and cannot support "you will get 120 covers"; but two
 * runs driven by the same arrivals differ from each other for reasons that
 * are in the geometry, which is the thing being designed. So:
 *
 * - Both runs must use the same seed and the same arrival rates, or the
 *   difference is partly the random stream and says nothing. `compare`
 *   refuses to compare scenes whose seeds differ.
 * - Every reported figure is a delta as well as a value, because only the
 *   delta is the claim.
 */

export type ScenarioMeasures = {
  id: string;
  seed: number;
  elapsedSeconds: number;
  /** Longest any shop or counter queue ever got, in people. */
  peakQueueLength: number;
  /**
   * People who got into a shop. Counted on entry, not on finishing: a run
   * shorter than the dwell would otherwise report every visit as zero, which
   * is exactly the run you use while iterating on a layout.
   */
  storeVisits: number;
  /**
   * Median time in a shop, seconds, over visits that *finished* inside the
   * run. A stay still open when the run ends is not counted, so this reads
   * low on a short run — compare it only between runs of equal length.
   */
  medianStoreStaySeconds: number;
  /** Worst cell density seen, people per square metre. */
  peakDensity: number;
  /** Share of occupied cell-samples at Fruin D or worse. */
  congestionShare: number;
  /** People leaving a minute, over the whole run. */
  throughputPerMinute: number;
  /** Mean journey length, seconds, over everyone who finished one. */
  meanJourneySeconds: number;
};

/** A place someone is *inside*: getting in is what a visit counts. */
const insideKinds = new Set(["browse", "enterStore"]);

export type MeasureDelta = {
  measure: string;
  baseline: number;
  variant: number;
  /** variant − baseline. */
  change: number;
  /** change / baseline. Null when the baseline is 0, where a ratio is meaningless. */
  changeRatio: number | null;
  /** Whether more of this measure is better. */
  moreIsBetter: boolean;
};

export type ScenarioComparison = {
  baseline: ScenarioMeasures;
  variants: { id: string; deltas: MeasureDelta[] }[];
};

export type MeasureOptions = {
  durationSeconds?: number;
  fixedDtSeconds?: number;
  sampleEverySeconds?: number;
  simulation?: Partial<SimulationEngineConfig>;
};

/** Run one scene and read the measures off it. */
export function measureScenario(
  scene: CrowdSimScene,
  id = scene.id,
  options: MeasureOptions = {},
): ScenarioMeasures {
  const fixedDtSeconds = options.fixedDtSeconds ?? 1 / 60;
  const durationSeconds = options.durationSeconds ?? 600;
  const sampleEverySeconds = options.sampleEverySeconds ?? 1;
  const totalSteps = Math.ceil(durationSeconds / fixedDtSeconds);
  const stepsPerSample = Math.max(1, Math.round(sampleEverySeconds / fixedDtSeconds));

  const engine = createSimulationEngineFromScene(scene, options.simulation ?? {});
  const analytics = createRunAnalytics();

  engine.start();

  let exited = 0;
  const visits = new Set<string>();
  const peakByPlace = new Map<string, number>();
  const openStay = new Map<number, { place: string; since: number }>();
  const staySeconds: number[] = [];

  /**
   * `runAnalytics` reports a place only once a stay at it has *closed*, so a
   * run that ends while everyone is still browsing reports nothing at all.
   * These measures are read straight off the crowd instead: a visit is
   * someone being inside, counted the moment they are.
   */
  const observe = (atSeconds: number, agents: readonly SimulationAgent[]) => {
    const concurrent = new Map<string, number>();
    const seen = new Set<number>();
    const close = (open: { place: string; since: number }) => {
      if (insideKinds.has(kindOf(open.place))) {
        staySeconds.push(atSeconds - open.since);
      }
    };

    for (const agent of agents) {
      const place = placeOfAgent(agent);
      const open = openStay.get(agent.id);
      seen.add(agent.id);

      if (!place) {
        // Left the shop, or left the mall. A stay that ends this way is a
        // finished one and counts; one still open when the run ends does not.
        if (open) {
          close(open);
          openStay.delete(agent.id);
        }
        continue;
      }

      concurrent.set(place, (concurrent.get(place) ?? 0) + 1);

      if (insideKinds.has(kindOf(place))) {
        visits.add(`${agent.id}|${place}`);
      }

      if (open?.place !== place) {
        if (open) {
          close(open);
        }
        openStay.set(agent.id, { place, since: atSeconds });
      }
    }

    for (const agentId of openStay.keys()) {
      // Gone from the crowd entirely: their stay ended because the run did,
      // not because they came out, so it is not a completed dwell.
      if (!seen.has(agentId)) {
        openStay.delete(agentId);
      }
    }

    for (const [place, count] of concurrent) {
      peakByPlace.set(place, Math.max(peakByPlace.get(place) ?? 0, count));
    }
  };

  for (let index = 0; index < totalSteps; index++) {
    const snapshot = engine.step(1);
    exited = snapshot.exitedCount;

    if ((index + 1) % stepsPerSample === 0) {
      analytics.record(scene, snapshot);
      observe(snapshot.elapsedSeconds, snapshot.agents);
    }
  }

  const summary = analytics.summary();
  const elapsed = summary.elapsedSeconds;
  let peakQueueLength = 0;

  for (const [place, peak] of peakByPlace) {
    if (kindOf(place) === "shopQueue" || kindOf(place) === "counterQueue") {
      peakQueueLength = Math.max(peakQueueLength, peak);
    }
  }

  return {
    id,
    seed: scene.seed,
    elapsedSeconds: elapsed,
    peakQueueLength,
    storeVisits: visits.size,
    medianStoreStaySeconds: percentile(staySeconds, 0.5),
    peakDensity: summary.levelOfService.peakDensity,
    congestionShare: summary.levelOfService.shareDOrWorse,
    throughputPerMinute: elapsed > 0 ? (exited / elapsed) * 60 : 0,
    meanJourneySeconds: summary.journeys.meanSeconds,
  };
}

/** Which side of the door someone is on, as `runAnalytics` names it. */
function placeOfAgent(agent: SimulationAgent): string | undefined {
  const id = agent.selectedStoreId ?? agent.servicePointId;

  if (!id) {
    return undefined;
  }

  switch (agent.lifecycleState) {
    case "browse":
      return `browse:${id}`;
    case "enterStore":
      return `service:${id}`;
    case "queue":
      return `shopQueue:${id}`;
    case "checkout":
      return `counterQueue:${id}`;
    default:
      return undefined;
  }
}

function kindOf(place: string) {
  return place.slice(0, place.indexOf(":"));
}

function percentile(values: readonly number[], q: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * q;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);

  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/**
 * Compare variants against a baseline. Every scene must carry the same seed
 * and have been run for the same length of time:
 *
 * - A differing seed puts the difference partly in the random stream, and
 *   then the comparison is not measuring the geometry at all.
 * - A differing run length scales every absolute measure here — twice the
 *   minutes is roughly twice the visits — and that growth would be reported
 *   as a design difference when it is only a longer run.
 */
export function compareScenarioMeasures(
  baseline: ScenarioMeasures,
  variants: ScenarioMeasures[],
): ScenarioComparison {
  for (const variant of variants) {
    if (variant.seed !== baseline.seed) {
      throw new Error(
        `Cannot compare '${variant.id}' (seed ${variant.seed}) against ` +
          `'${baseline.id}' (seed ${baseline.seed}): different seeds make the ` +
          `difference partly the random stream, not the layout`,
      );
    }

    if (variant.elapsedSeconds !== baseline.elapsedSeconds) {
      throw new Error(
        `Cannot compare '${variant.id}' (${round(variant.elapsedSeconds)} s) against ` +
          `'${baseline.id}' (${round(baseline.elapsedSeconds)} s): a longer run ` +
          `collects more visits and more exits whatever the layout is`,
      );
    }
  }

  return {
    baseline,
    variants: variants.map((variant) => ({
      id: variant.id,
      deltas: [
        delta(
          "peakQueueLength",
          baseline.peakQueueLength,
          variant.peakQueueLength,
          false,
        ),
        delta("storeVisits", baseline.storeVisits, variant.storeVisits, true),
        delta(
          "medianStoreStaySeconds",
          baseline.medianStoreStaySeconds,
          variant.medianStoreStaySeconds,
          false,
        ),
        delta("peakDensity", baseline.peakDensity, variant.peakDensity, false),
        delta(
          "congestionShare",
          baseline.congestionShare,
          variant.congestionShare,
          false,
        ),
        delta(
          "throughputPerMinute",
          baseline.throughputPerMinute,
          variant.throughputPerMinute,
          true,
        ),
        delta(
          "meanJourneySeconds",
          baseline.meanJourneySeconds,
          variant.meanJourneySeconds,
          false,
        ),
      ],
    })),
  };
}

function delta(
  measure: string,
  baselineValue: number,
  variantValue: number,
  moreIsBetter: boolean,
): MeasureDelta {
  const change = variantValue - baselineValue;

  return {
    measure,
    baseline: baselineValue,
    variant: variantValue,
    change,
    changeRatio: baselineValue === 0 ? null : change / baselineValue,
    moreIsBetter,
  };
}

/**
 * What each measure is called in a report. The report is read by the person
 * choosing a layout, so it is written in their language, not in the schema's.
 */
const measureNames: Record<string, string> = {
  peakQueueLength: "最长排队",
  storeVisits: "进店人次",
  medianStoreStaySeconds: "停留时长中位数",
  peakDensity: "最高密度",
  congestionShare: "拥堵采样占比",
  throughputPerMinute: "每分钟出场人数",
  meanJourneySeconds: "平均在场时长",
};

/**
 * One line per measure, phrased as the comparison rather than as the value,
 * because only the comparison is the claim. A baseline of 0 gives no ratio
 * and says so instead of inventing one.
 */
export function describeDelta(delta: MeasureDelta): string {
  const name = measureNames[delta.measure] ?? delta.measure;

  if (delta.changeRatio === null) {
    return `${name}：${round(delta.baseline)} → ${round(delta.variant)}（基线为 0，不给百分比）`;
  }

  if (delta.change === 0) {
    return `${name}：持平（${round(delta.baseline)}）`;
  }

  const percent = Math.round(delta.changeRatio * 100);

  // A real change that rounds to 0% is not "unchanged", and it is not honest
  // to print "0%" next to a direction: the reader cannot tell whether nothing
  // moved or the number is just small.
  if (percent === 0) {
    return `${name}：基本持平（${round(delta.baseline)} → ${round(delta.variant)}，变化 ${round(delta.change)}）`;
  }

  const better = delta.change > 0 === delta.moreIsBetter;

  return (
    `${name}：${percent > 0 ? "+" : ""}${percent}%（${round(delta.baseline)} → ` +
    `${round(delta.variant)}，${better ? "更好" : "更差"}）`
  );
}

/**
 * The whole comparison as lines someone can read, caveats included.
 *
 * The headline above the numbers is not decoration: this product sells the
 * difference between two layouts, not the figure either one produced, and a
 * reader who takes an absolute number out of here has been mis-sold.
 */
export function describeComparison(comparison: ScenarioComparison): string[] {
  const lines = [
    `基线「${comparison.baseline.id}」，随机种子 ${comparison.baseline.seed}，跑批 ${round(comparison.baseline.elapsedSeconds)} 秒。`,
    "以下只比较两个方案之间的差值；绝对数值不可用于预测客流。",
  ];

  for (const variant of comparison.variants) {
    lines.push("", `方案「${variant.id}」：`);

    for (const entry of variant.deltas) {
      lines.push(`- ${describeDelta(entry)}`);
    }
  }

  return lines;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
