import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  cleanZhOverrides,
  editorToolKeys,
  messages,
  probeMessageKeys,
  sceneNames,
  zhOverrides,
  type TranslationKey,
} from "./i18nMessages";

export type Language = "zh" | "en";

export type LocalizedText = Record<Language, string>;

type TranslationValues = Record<string, number | string>;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  text: (value: LocalizedText) => string;
  toggleLanguage: () => void;
};

const languageStorageKey = "crowdsim.language";
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      interpolate(getMessage(language, key), values),
    [language],
  );

  const text = useCallback((value: LocalizedText) => value[language], [language]);

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => (current === "zh" ? "en" : "zh"));
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      text,
      toggleLanguage,
    }),
    [language, setLanguage, t, text, toggleLanguage],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}

export function translate(
  language: Language,
  key: TranslationKey,
  values?: TranslationValues,
) {
  return interpolate(getMessage(language, key), values);
}

export function localize(language: Language, value: LocalizedText) {
  return value[language];
}

export function formatProbeMessage(message: string, language: Language) {
  const key = probeMessageKeys[message];

  return key ? translate(language, key) : message;
}

export function formatBehaviorModeLabel(label: string, language: Language) {
  if (label === "Evacuating") {
    return translate(language, "evacuating");
  }

  if (label === "Normal") {
    return translate(language, "normal");
  }

  return label;
}

export function formatEditorTool(tool: string, language: Language) {
  const key = editorToolKeys[tool];

  return key ? translate(language, key) : tool;
}

function getMessage(language: Language, key: TranslationKey) {
  return language === "zh"
    ? (cleanZhOverrides[key] ?? zhOverrides[key] ?? messages[key].zh)
    : messages[key].en;
}

export function formatSceneName(
  scene: { id: string; name: string },
  language: Language,
) {
  const knownName = sceneNames[scene.id];

  if (knownName) {
    return language === "zh" ? (zhSceneNames[scene.id] ?? knownName.zh) : knownName.en;
  }

  if (scene.name === "Mall Template Draft") {
    return language === "zh" ? "商场模板草稿" : scene.name;
  }

  if (scene.name === "Scene Template Draft") {
    return language === "zh" ? "场景模板草稿" : scene.name;
  }

  return scene.name;
}

const zhSceneNames: Record<string, string> = {
  "atrium-demo": "中庭示例",
  "biocity-rainy-high-street": "雨天商业街",
  "mall-atrium": "商场中庭",
  "metro-station-hall": "地铁站厅",
  "performance-venue": "演出场馆疏散",
};

function readStoredLanguage(): Language {
  if (typeof localStorage === "undefined") {
    return "zh";
  }

  const stored = localStorage.getItem(languageStorageKey);

  return stored === "en" || stored === "zh" ? stored : "zh";
}

function interpolate(message: string, values?: TranslationValues) {
  if (!values) {
    return message;
  }

  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

export type { TranslationKey } from "./i18nMessages";
