import {
  formatSceneName,
  translate,
  type Language,
  type LocalizedText,
  type TranslationKey,
} from "../i18n";

export function makeStatus(
  key: TranslationKey,
  values?: Partial<Record<Language, Record<string, number | string>>>,
): LocalizedText {
  return {
    en: translate("en", key, values?.en),
    zh: translate("zh", key, values?.zh),
  };
}

export function sceneNameValues(scene: { id: string; name: string }) {
  return {
    en: { name: formatSceneName(scene, "en") },
    zh: { name: formatSceneName(scene, "zh") },
  };
}

export function fileNameValues(name: string) {
  return {
    en: { name },
    zh: { name },
  };
}
