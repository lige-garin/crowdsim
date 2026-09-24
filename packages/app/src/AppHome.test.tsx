import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHome } from "./AppHome";

afterEach(cleanup);

// These tests check the status pulses (SIM/GPU/TRACE/DATA), which only
// render in expert mode's hero -- basic mode replaces that panel with the
// template gallery (see AppHome.uiMode.test.tsx).
function renderHome() {
  return render(
    <AppHome
      language="en"
      onEnterLab={vi.fn()}
      onOpenNetwork={vi.fn()}
      onSelectTemplate={vi.fn()}
      onSetLanguage={vi.fn()}
      onToggleUiMode={vi.fn()}
      runState="running"
      uiMode="expert"
      webGpuStatus="ready"
    />,
  );
}

describe("AppHome status pulses", () => {
  it("describes real local persistence, not a backend that no longer exists", () => {
    renderHome();
    // packages/backend was deleted 2026-09-24 (never deployable, never
    // reachable from this client -- see docs/CLAIMS_LEDGER.md). The real
    // persistence is localStorage/file export, not a database of any kind.
    expect(screen.getByText("local")).toBeInTheDocument();
    expect(screen.queryByText("D1/R2")).not.toBeInTheDocument();
    expect(screen.queryByText("memory")).not.toBeInTheDocument();
  });

  it("never claims image tracing has a model behind it", () => {
    renderHome();
    expect(screen.getByText("fixture")).toBeInTheDocument();
  });
});
