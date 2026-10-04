import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./scenes/demoScene";
import { createLiveCrowd } from "./engine/liveCrowd";
import { I18nProvider } from "./i18n";
import { AppStage } from "./AppStage";
import { defaultViewportLayers } from "./viewport/viewportLayers";
import type { SimulationSnapshot } from "./engine/simulationEngine";

const buildSpy = vi.hoisted(() => vi.fn());

vi.mock("./engine/crowdContactNetwork", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./engine/crowdContactNetwork")>();
  return {
    ...actual,
    buildCrowdContactNetwork: (
      ...args: Parameters<typeof actual.buildCrowdContactNetwork>
    ) => {
      buildSpy();
      return actual.buildCrowdContactNetwork(...args);
    },
  };
});

afterEach(() => {
  cleanup();
  buildSpy.mockClear();
});

beforeEach(() => {
  vi.useFakeTimers();
  return () => vi.useRealTimers();
});

function snapshotAt(elapsedSeconds: number): SimulationSnapshot {
  return {
    agentCount: 0,
    agents: [],
    elapsedSeconds,
    exitedCount: 0,
    spawnedCount: 0,
    status: "running",
    stepCount: Math.round(elapsedSeconds * 60),
    timeScale: 1,
  };
}

function renderNetworkView() {
  const crowd = createLiveCrowd({ snapshot: snapshotAt(0) });
  render(
    <I18nProvider>
      <AppStage
        crowd={crowd}
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
        simulationFault={null}
        stageTab="run"
        t={(key) => key}
        viewMode="network"
        viewScene={demoScene}
      />
    </I18nProvider>,
  );
  return crowd;
}

/**
 * The contact graph is O(N²) over the whole crowd, and it used to be built
 * inside AppStage's JSX — so every snapshot, sixty times a second, paid for a
 * full rebuild nobody could have read.
 */
describe("AppStage contact network", () => {
  it("does not rebuild the graph for every snapshot that lands", () => {
    const crowd = renderNetworkView();

    // Ten snapshots at 60 Hz, the way the tick loop delivers them.
    for (let frame = 1; frame <= 10; frame++) {
      act(() => crowd.set({ snapshot: snapshotAt(frame / 60) }));
    }

    // One build, taken as the view opened — none of the ten paid for another.
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it("does rebuild on its own timer, so the graph still follows the crowd", async () => {
    const crowd = renderNetworkView();
    act(() => crowd.set({ snapshot: snapshotAt(1) }));

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(buildSpy).toHaveBeenCalledTimes(2);
  });
});
