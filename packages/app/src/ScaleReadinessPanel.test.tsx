import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { ScaleReadinessPanel } from "./ScaleReadinessPanel";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ScaleReadinessPanel", () => {
  it("renders multi-floor, 500k, and one-click demo readiness", () => {
    render(
      <I18nProvider>
        <ScaleReadinessPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "规模投影" })).toBeInTheDocument();
    expect(screen.getByText(/2 楼层/)).toBeInTheDocument();
    expect(screen.getByText(/未在任何设备上实测/)).toBeInTheDocument();
    expect(screen.getByText(/webgpu-indirect/)).toBeInTheDocument();
    expect(screen.getByText(/500k within-budget \(not-measured\)/)).toBeInTheDocument();
    expect(screen.getByText(/demo 6 steps/)).toBeInTheDocument();
    expect(screen.getByText(/assets 2/)).toBeInTheDocument();
    expect(screen.getByText(/flow atlas 2 fields/)).toBeInTheDocument();
    expect(screen.getByText(/targetField routed/)).toBeInTheDocument();
    expect(
      screen.getByText(/indirect planned-drawIndirect \(no renderer wired\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/batches 8/)).toBeInTheDocument();
  });
});
