import type { TranslationKey } from "./i18n";
import type { RenderStatus } from "./simulationViewportTypes";

export function localizedStatus(key: TranslationKey): RenderStatus {
  return { key, type: "localized" };
}

export function rawStatus(message: string): RenderStatus {
  return { message, type: "raw" };
}
