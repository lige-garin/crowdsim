import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDiagnostics,
  formatDiagnostics,
  installGlobalErrorDiagnostics,
  recordDiagnostic,
} from "./errorDiagnostics";

const storageKey = "crowdsim.diagnostics.v1";

afterEach(() => {
  clearDiagnostics();
  localStorage.clear();
});

describe("errorDiagnostics (REVIEW-2026-10-02 P1 #8, local half)", () => {
  it("records errors and formats them into a pasteable bug report", () => {
    recordDiagnostic("ui", "boom");

    const text = formatDiagnostics();

    expect(text).toContain("CrowdSim diagnostics");
    expect(text).toContain("url:");
    expect(text).toContain("userAgent:");
    expect(text).toContain("crossOriginIsolated:");
    expect(text).toContain("[ui] boom");
  });

  it("says so honestly when nothing was recorded", () => {
    expect(formatDiagnostics()).toContain("no recorded errors");
  });

  it("persists across a reload, because crashes end in reloads", () => {
    recordDiagnostic("error", "persisted failure");

    expect(localStorage.getItem(storageKey)).toContain("persisted failure");
  });

  it("never throws on a corrupt slot", () => {
    localStorage.setItem(storageKey, "{not json");

    // loadEntries runs at module scope; the observable contract here is that
    // recording still works on top of a corrupt slot instead of throwing.
    recordDiagnostic("rejection", "still fine");
    expect(formatDiagnostics()).toContain("[rejection] still fine");
  });

  it("caps messages so one runaway error cannot eat the quota", () => {
    recordDiagnostic("error", "x".repeat(5_000));

    expect(localStorage.getItem(storageKey)!.length).toBeLessThan(
      storageKey.length + 1_000,
    );
  });

  it("installs the global capture points exactly once", () => {
    const errorListener = vi.spyOn(window, "addEventListener");
    // jsdom dispatches a real ErrorEvent through the "error" path.
    installGlobalErrorDiagnostics();
    installGlobalErrorDiagnostics();

    const registered = errorListener.mock.calls.filter(
      ([type]) => type === "error" || type === "unhandledrejection",
    );
    expect(registered).toHaveLength(2);
    errorListener.mockRestore();
  });

  it("captures unhandled promise rejections through the installed hooks", () => {
    // Idempotent no-op if an earlier test already installed the hooks —
    // either way the real listener is on window.
    installGlobalErrorDiagnostics();

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: "worker died",
      }),
    );
    expect(formatDiagnostics()).toContain("[rejection] worker died");
  });
});
