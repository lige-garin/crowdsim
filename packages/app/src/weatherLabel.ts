import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { getActiveWeatherSample } from "./sceneRuntimeConditions";

type WeatherCondition = CrowdSimScene["weatherProfile"]["samples"][number]["condition"];

const conditionText: Record<WeatherCondition, { en: string; zh: string }> = {
  clear: { en: "Clear", zh: "晴" },
  cloudy: { en: "Cloudy", zh: "多云" },
  cold: { en: "Cold", zh: "寒冷" },
  fog: { en: "Fog", zh: "雾" },
  heat: { en: "Heat", zh: "高温" },
  heavyRain: { en: "Heavy rain", zh: "大雨" },
  rain: { en: "Rain", zh: "雨" },
  snow: { en: "Snow", zh: "雪" },
  storm: { en: "Storm", zh: "风暴" },
  wind: { en: "Wind", zh: "大风" },
};

/**
 * The topbar's weather readout.
 *
 * It used to be the string literal "雨 / 风" (Rain / wind) regardless of the
 * scene or the clock, which made the whole environment layer look wired up when
 * nothing was reading it. This resolves the scene's actual weather profile at
 * the current simulated second, and says so honestly when the profile has no
 * sample covering that moment.
 */
export function formatSceneWeather(
  scene: CrowdSimScene,
  elapsedSeconds: number,
  language: "zh" | "en",
): string {
  const sample = getActiveWeatherSample(scene, elapsedSeconds);

  if (!sample) {
    return language === "zh" ? "无数据" : "No data";
  }

  const label = conditionText[sample.condition][language];
  const temperature = `${Math.round(sample.temperatureC)}°C`;

  return `${label} ${temperature}`;
}
