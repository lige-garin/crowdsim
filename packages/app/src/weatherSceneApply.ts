import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import type { WeatherEnvironmentFactorInput } from "./weatherMcpClient";

/**
 * Drops a fresh batch of `weatherToEnvironmentFactors` output into a scene,
 * replacing (not accumulating alongside) any factors a previous fetch under
 * the same `idPrefix` already added — every id `weatherToEnvironmentFactors`
 * produces is `${idPrefix}-${kind}`, so clicking "fetch weather" again
 * updates the scene's weather instead of piling up duplicate rain/fog/wind
 * factors each time. Factors from any other source (a hazard placed by
 * hand, say) are untouched — only ids under this exact prefix are removed.
 */
export function applyWeatherFactorsToScene(
  scene: CrowdSimScene,
  factors: readonly WeatherEnvironmentFactorInput[],
  idPrefix = "weather",
): CrowdSimScene {
  const kept = scene.environmentFactors.filter(
    (factor) => !factor.id.startsWith(`${idPrefix}-`),
  );
  // `factors` is input-shaped (`weatherToEnvironmentFactors`'s optional
  // defaultable fields, e.g. `severity`, aren't guaranteed filled the way
  // `scene.environmentFactors`'s own parsed entries are) — `parseScene`
  // fills those defaults and validates the merged result the same way
  // every other scene-mutating path in this app already does
  // (`aiSceneAssistant.ts`, `benchmarkScenarios.ts`), rather than trusting
  // an external fetch's shape directly.
  return parseScene({
    ...scene,
    environmentFactors: [...kept, ...factors],
  });
}
