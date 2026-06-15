import type { BrandDecisionInsight } from "./brandDecisionProbe";
import type { DashboardSample } from "./dashboardStats";
import type { HeatmapSample } from "./heatmap";
import type { LocalizedText } from "./i18n";

export type QueueLengthPoint = {
  elapsedSeconds: number;
  queueLength: number;
};

export type DashboardV2Stats = {
  brandAttractionPercent: number;
  brandChoice: string;
  crossSectionFlowPerMinute: number;
  queueLengthSeries: QueueLengthPoint[];
  shopEntryRatePercent: number;
  summary: LocalizedText;
  trajectoryReplay: LocalizedText;
};

export function createDashboardV2Stats(options: {
  brandInsight?: BrandDecisionInsight;
  heatmapSamples: readonly HeatmapSample[];
  queueThroughput: number;
  samples: readonly DashboardSample[];
  shopDecisionSummary: string;
}): DashboardV2Stats {
  const queueLengthSeries = options.samples.slice(-40).map((sample) => ({
    elapsedSeconds: sample.elapsedSeconds,
    queueLength: Math.max(
      0,
      Math.round(sample.agentCount * 0.22 - options.queueThroughput * 0.02),
    ),
  }));
  const shopEntryRatePercent = parseSoftmaxProbability(options.shopDecisionSummary);
  const crossSectionFlowPerMinute = calculateFlowPerMinute(options.samples);
  const trajectoryReplay = createTrajectoryReplay(options.heatmapSamples);
  const trackCount = trajectoryReplay.count;
  const brandAttractionPercent = options.brandInsight?.probabilityPercent ?? 0;
  const brandChoice = options.brandInsight?.selectedBrandName ?? "none";
  const queuePeak = Math.max(0, ...queueLengthSeries.map((point) => point.queueLength));

  return {
    brandAttractionPercent,
    brandChoice,
    crossSectionFlowPerMinute,
    queueLengthSeries,
    shopEntryRatePercent,
    summary: {
      zh: [
        `进店率 ${shopEntryRatePercent}%`,
        `队列峰值 ${queuePeak}`,
        `流量 ${crossSectionFlowPerMinute}/min`,
        `品牌 ${brandChoice} ${brandAttractionPercent}%`,
        `轨迹 ${trackCount}`,
      ].join(" | "),
      en: [
        `Shop entry ${shopEntryRatePercent}%`,
        `Queue peak ${queuePeak}`,
        `Flow ${crossSectionFlowPerMinute}/min`,
        `Brand ${brandChoice} ${brandAttractionPercent}%`,
        `Tracks ${trackCount}`,
      ].join(" | "),
    },
    trajectoryReplay: trajectoryReplay.text,
  };
}

function parseSoftmaxProbability(summary: string): number {
  const match = summary.match(/\bp=([0-9.]+)/);

  if (!match) {
    return 0;
  }

  return Math.round(Number(match[1]) * 100);
}

function calculateFlowPerMinute(samples: readonly DashboardSample[]): number {
  if (samples.length < 2) {
    return 0;
  }

  const latest = samples.at(-1)!;
  const previous = samples[Math.max(0, samples.length - 6)];
  const elapsed = latest.elapsedSeconds - previous.elapsedSeconds;

  if (elapsed <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(((latest.exitedCount - previous.exitedCount) / elapsed) * 60),
  );
}

function createTrajectoryReplay(samples: readonly HeatmapSample[]): {
  count: number;
  text: LocalizedText;
} {
  const latestSample = samples.at(-1);

  if (!latestSample || latestSample.agents.length === 0) {
    return {
      count: 0,
      text: {
        zh: "无轨迹",
        en: "No tracks",
      },
    };
  }

  const replay = latestSample.agents
    .slice(0, 6)
    .map((agent, index) => {
      const id = agent.id ?? index + 1;

      return `${id}@${agent.x.toFixed(1)},${agent.y.toFixed(1)}`;
    })
    .join(" | ");

  return {
    count: latestSample.agents.slice(0, 6).length,
    text: {
      zh: replay,
      en: replay,
    },
  };
}
