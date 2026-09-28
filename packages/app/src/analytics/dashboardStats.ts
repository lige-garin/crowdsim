import type { LocalizedText } from "../i18n";

export type DashboardSample = {
  elapsedSeconds: number;
  agentCount: number;
  exitedCount: number;
};

export type DashboardEvacuationPoint = {
  elapsedSeconds: number;
  exited: number;
  remaining: number;
};

export type DashboardStats = {
  currentAgentCount: number;
  densityPeak: number;
  evacuationCompletionSeconds: number | null;
  evacuationElapsedSeconds: number | null;
  evacuationStatus: "idle" | "running" | "complete";
  exitedCount: number;
  populationSeries: DashboardSample[];
  summary: LocalizedText;
};

export function createDashboardStats(options: {
  densityPeak: number;
  evacuationActive: boolean;
  evacuationCurve: readonly DashboardEvacuationPoint[];
  samples: readonly DashboardSample[];
}): DashboardStats {
  const populationSeries = options.samples.slice(-90);
  const latestSample = populationSeries.at(-1);
  const completedPoint = options.evacuationCurve.find((point) => point.remaining === 0);
  const latestEvacuationPoint = options.evacuationCurve.at(-1);
  const evacuationStatus = completedPoint
    ? "complete"
    : options.evacuationActive
      ? "running"
      : "idle";
  const evacuationCompletionSeconds = completedPoint?.elapsedSeconds ?? null;
  const evacuationElapsedSeconds =
    latestEvacuationPoint?.elapsedSeconds ?? (options.evacuationActive ? 0 : null);
  const currentAgentCount = latestSample?.agentCount ?? 0;
  const exitedCount = latestSample?.exitedCount ?? 0;
  const densityPeak = Math.max(0, options.densityPeak);

  return {
    currentAgentCount,
    densityPeak,
    evacuationCompletionSeconds,
    evacuationElapsedSeconds,
    evacuationStatus,
    exitedCount,
    populationSeries,
    summary: {
      zh: [
        `人数 ${currentAgentCount}`,
        `已离开 ${exitedCount}`,
        `密度峰值 ${densityPeak}`,
        `疏散 ${formatEvacuationSummary(
          "zh",
          evacuationStatus,
          evacuationCompletionSeconds,
          evacuationElapsedSeconds,
        )}`,
      ].join(" | "),
      en: [
        `Agents ${currentAgentCount}`,
        `Exited ${exitedCount}`,
        `Peak density ${densityPeak}`,
        `Evacuation ${formatEvacuationSummary(
          "en",
          evacuationStatus,
          evacuationCompletionSeconds,
          evacuationElapsedSeconds,
        )}`,
      ].join(" | "),
    },
  };
}

function formatEvacuationSummary(
  language: "zh" | "en",
  status: DashboardStats["evacuationStatus"],
  completionSeconds: number | null,
  elapsedSeconds: number | null,
) {
  if (status === "complete" && completionSeconds !== null) {
    return language === "zh"
      ? `完成 ${formatSeconds(completionSeconds)}`
      : `complete ${formatSeconds(completionSeconds)}`;
  }

  if (status === "running") {
    return language === "zh"
      ? `进行中 ${formatSeconds(elapsedSeconds ?? 0)}`
      : `running ${formatSeconds(elapsedSeconds ?? 0)}`;
  }

  return language === "zh" ? "空闲" : "idle";
}

function formatSeconds(seconds: number) {
  return `${Math.max(0, Math.round(seconds))}s`;
}
