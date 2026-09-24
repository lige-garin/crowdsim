import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UiModeProvider, useUiMode } from "./uiMode";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
});

describe("useUiMode", () => {
  it("defaults to basic mode when nothing is stored", () => {
    const { result } = renderHook(() => useUiMode(), { wrapper: UiModeProvider });

    expect(result.current.uiMode).toBe("basic");
  });

  it("toggles between basic and expert", () => {
    const { result } = renderHook(() => useUiMode(), { wrapper: UiModeProvider });

    act(() => result.current.toggleUiMode());
    expect(result.current.uiMode).toBe("expert");

    act(() => result.current.toggleUiMode());
    expect(result.current.uiMode).toBe("basic");
  });

  it("persists the chosen mode to localStorage", () => {
    const { result } = renderHook(() => useUiMode(), { wrapper: UiModeProvider });

    act(() => result.current.toggleUiMode());

    expect(localStorage.getItem("crowdsim.uiMode")).toBe("expert");
  });

  it("reads a previously stored expert mode on next mount", () => {
    localStorage.setItem("crowdsim.uiMode", "expert");

    const { result } = renderHook(() => useUiMode(), { wrapper: UiModeProvider });

    expect(result.current.uiMode).toBe("expert");
  });

  it("ignores a garbage stored value and falls back to basic", () => {
    localStorage.setItem("crowdsim.uiMode", "not-a-real-mode");

    const { result } = renderHook(() => useUiMode(), { wrapper: UiModeProvider });

    expect(result.current.uiMode).toBe("basic");
  });

  it("throws when used outside UiModeProvider", () => {
    expect(() => renderHook(() => useUiMode())).toThrow(
      "useUiMode must be used within UiModeProvider",
    );
  });
});
