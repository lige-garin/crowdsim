import type { TranslationKey } from "./i18n";

export type ViewMode = "2d" | "3d";

export type RenderStatus =
  | { key: TranslationKey; type: "localized" }
  | { message: string; type: "raw" };
