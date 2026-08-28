import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { bioCityTopbarMetricText } from "./bioCityUiContract";
import { crowdFlowAnalytics } from "./crowdFlowAnalytics";
import type { Language } from "./i18n";
import type { SimulationSnapshot } from "./simulationEngine";
import { formatSceneWeather } from "./weatherLabel";

export type BioCityTopbarMetric = {
  label: string;
  state?: string;
  value: string;
};

export function createBioCityTopbarMetrics({
  brandAttractionPercent,
  densityPeak,
  evacuationActive,
  language,
  runState,
  runtime,
  scene,
  snapshot,
}: {
  brandAttractionPercent: number;
  densityPeak: number;
  evacuationActive: boolean;
  language: Language;
  runState: string;
  runtime: { sharedMemory: string; thread: string };
  scene: CrowdSimScene;
  snapshot: SimulationSnapshot;
}): readonly BioCityTopbarMetric[] {
  const crowdFlow = crowdFlowAnalytics(snapshot.agents, scene.shops);
  const satisfactionScore = Math.max(
    60,
    Math.min(
      98,
      94 - densityPeak * 2 - crowdFlow.totalQueuing * 0.5 - (evacuationActive ? 8 : 0),
    ),
  );
  const commercialForecast = Math.round(
    80 +
      crowdFlow.totalShopping * 1.5 +
      brandAttractionPercent * 0.5 +
      densityPeak * 1.1,
  );
  const topbarLabels = bioCityTopbarMetricText.map((item) => item[language]);

  return [
    { label: topbarLabels[0], state: snapshot.status, value: runState },
    { label: topbarLabels[1], value: `${Math.floor(snapshot.elapsedSeconds)}s` },
    {
      label: topbarLabels[2],
      value: formatSceneWeather(scene, snapshot.elapsedSeconds, language),
    },
    { label: topbarLabels[3], value: snapshot.agentCount.toLocaleString() },
    { label: topbarLabels[4], value: snapshot.spawnedCount.toLocaleString() },
    {
      label: topbarLabels[5],
      value:
        language === "zh"
          ? `营收 ${commercialForecast}k`
          : `CNY ${commercialForecast}k`,
    },
    { label: topbarLabels[6], value: `${satisfactionScore}%` },
    { label: topbarLabels[7], value: `${runtime.thread} / ${runtime.sharedMemory}` },
  ] as const;
}
