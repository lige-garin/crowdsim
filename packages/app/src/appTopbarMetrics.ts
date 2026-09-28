import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { Language } from "./i18n";
import type { SimulationSnapshot } from "./engine/simulationEngine";
import { formatSimulationClock } from "./appUi";
import { formatSceneWeather } from "./weatherLabel";

export type HudReadout = { label: string; value: string };

/**
 * The live readouts the HUD shows: the simulation clock and the weather.
 *
 * This used to build an eight-entry "top bar" (run state, footfall, kernel, and
 * earlier a made-up sales figure) that the game HUD read two entries of, by
 * position.
 */
export function createHudReadouts({
  language,
  scene,
  snapshot,
}: {
  language: Language;
  scene: CrowdSimScene;
  snapshot: SimulationSnapshot;
}): { clock: HudReadout; weather: HudReadout } {
  const zh = language === "zh";
  return {
    clock: {
      label: zh ? "时间" : "Time",
      value: formatSimulationClock(snapshot.elapsedSeconds),
    },
    weather: {
      label: zh ? "天气" : "Weather",
      value: formatSceneWeather(scene, snapshot.elapsedSeconds, language),
    },
  };
}
