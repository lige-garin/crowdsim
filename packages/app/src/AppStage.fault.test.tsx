import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./scenes/demoScene";
import { createLiveCrowd } from "./engine/liveCrowd";
import { I18nProvider } from "./i18n";
import { AppStage } from "./AppStage";
import { defaultViewportLayers } from "./viewport/viewportLayers";

afterEach(() => {
  cleanup();
});

const emptyCrowd = createLiveCrowd({ snapshot: undefined });

function renderStage(simulationFault: { message: string; onRetry: () => void } | null) {
  return render(
    <I18nProvider>
      <AppStage
        crowd={emptyCrowd}
        editorTool="select"
        floors={[]}
        heatmapCells={[]}
        language="zh"
        layers={defaultViewportLayers}
        onApplyScene={() => {}}
        onEditorToolChange={() => {}}
        onPlaceInWorld={() => {}}
        onPlaceLineInWorld={() => {}}
        onSelectViewFloor={() => {}}
        scene={demoScene}
        simulationFault={simulationFault}
        stageTab="run"
        t={(key) => key}
        viewMode="network"
        viewScene={demoScene}
      />
    </I18nProvider>,
  );
}

/**
 * REVIEW-2026-10-02 P1 #7: a dead worker used to surface as one English
 * engineering-log line in the signal dock. The stage-level card is the
 * user-level replacement.
 */
describe("AppStage simulation fault card", () => {
  it("says the simulation stopped, not an engineering message, and offers retry", () => {
    renderStage({ message: "Simulation worker failed", onRetry: vi.fn() });

    expect(screen.getByTestId("simulation-fault")).toBeInTheDocument();
    expect(screen.getByText("simulationFaultTitle")).toBeInTheDocument();
    expect(screen.getByText("simulationFaultBody")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "retrySimulation" })).toBeInTheDocument();
  });

  it("keeps the raw message reachable under the technical detail toggle", () => {
    renderStage({ message: "boom at tick 42", onRetry: vi.fn() });

    expect(screen.getByText("technicalDetail")).toBeInTheDocument();
    expect(screen.getByText("boom at tick 42")).toBeInTheDocument();
  });

  it("fires retry from the card", () => {
    const onRetry = vi.fn();
    renderStage({ message: "dead", onRetry });

    fireEvent.click(screen.getByTestId("simulation-fault-retry"));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders no card while the fault is null", () => {
    renderStage(null);

    expect(screen.queryByTestId("simulation-fault")).toBeNull();
  });
});
