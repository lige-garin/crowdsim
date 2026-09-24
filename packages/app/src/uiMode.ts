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

/**
 * Basic vs. expert app-wide mode. Mirrors `i18n.ts`'s `I18nProvider`
 * structure line for line -- storage key, typed read-with-fallback,
 * lazy `useState` init, persist `useEffect`, context + hook -- because
 * this is the same shape of problem `I18nProvider` already solves: a
 * cross-cutting UI choice needed by components at very different
 * depths (the home screen, the build toolbar, the panel dock),
 * persisted across reloads. There is no generic `usePersistedState`
 * hook anywhere in this codebase; each persisted value hand-rolls this
 * same shape, so a new one does too rather than introducing a
 * generic abstraction for a second user.
 *
 * Basic mode is the default: a new visitor sees the four-step
 * template → run → dashboard → report path, not the full editor and
 * its 23 build tools. Expert mode is everything this app already had
 * before this mode existed, behind one switch.
 */
export type UiMode = "basic" | "expert";

type UiModeContextValue = {
  uiMode: UiMode;
  toggleUiMode: () => void;
};

const uiModeStorageKey = "crowdsim.uiMode";
const UiModeContext = createContext<UiModeContextValue | null>(null);

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [uiMode, setUiModeState] = useState<UiMode>(readStoredUiMode);

  useEffect(() => {
    localStorage.setItem(uiModeStorageKey, uiMode);
  }, [uiMode]);

  const toggleUiMode = useCallback(() => {
    setUiModeState((current) => (current === "basic" ? "expert" : "basic"));
  }, []);

  const value = useMemo(() => ({ uiMode, toggleUiMode }), [uiMode, toggleUiMode]);

  return createElement(UiModeContext.Provider, { value }, children);
}

export function useUiMode() {
  const context = useContext(UiModeContext);

  if (!context) {
    throw new Error("useUiMode must be used within UiModeProvider");
  }

  return context;
}

function readStoredUiMode(): UiMode {
  if (typeof localStorage === "undefined") {
    return "basic";
  }

  const stored = localStorage.getItem(uiModeStorageKey);

  return stored === "expert" ? "expert" : "basic";
}
