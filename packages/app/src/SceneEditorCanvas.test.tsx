import { createRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { SceneEditorCanvas } from "./SceneEditorCanvas";
import { createLiveCrowd } from "./liveCrowd";
import { createEditorDocumentFromScene } from "./sceneEditorState";

afterEach(() => {
  cleanup();
});

describe("SceneEditorCanvas", () => {
  it("renders live simulation agents on the editable floor plan", () => {
    const { container } = render(
      <SceneEditorCanvas
        aiImageOverlay={null}
        baseScene={demoScene}
        basemap={null}
        document={createEditorDocumentFromScene(demoScene)}
        draftWallPoints={[]}
        gridSize={2}
        crowd={createLiveCrowd({
          snapshot: {
            agentCount: 1,
            agents: [
              { id: 7, targetX: 76, targetY: 24, vx: 1.5, vy: -0.5, x: 8, y: 44 },
            ],
            elapsedSeconds: 0,
            exitedCount: 0,
            spawnedCount: 1,
            status: "running",
            stepCount: 0,
            timeScale: 1,
          },
        })}
        onCanvasPointerDown={vi.fn()}
        onEntityPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        selectedId={null}
        svgRef={createRef<SVGSVGElement>()}
        t={(key) => key}
        visibleHeatmapCells={[]}
        viewMode="topDown"
      />,
    );

    expect(container.querySelector('[data-agent-id="7"]')).toBeInTheDocument();
    expect(container.querySelector(".editor-live-agent-heading")).toBeInTheDocument();
  });

  it("renders BioCity roads, buildings, stops, obstacles, and hazards", () => {
    const { container } = render(
      <SceneEditorCanvas
        aiImageOverlay={null}
        baseScene={bioCityDemoScene}
        basemap={null}
        document={createEditorDocumentFromScene(bioCityDemoScene)}
        draftWallPoints={[]}
        gridSize={2}
        onCanvasPointerDown={vi.fn()}
        onEntityPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        selectedId="curbside-pooling"
        svgRef={createRef<SVGSVGElement>()}
        t={(key) => key}
        visibleHeatmapCells={[]}
        viewMode="topDown"
      />,
    );

    expect(container.querySelector(".editor-road")).toBeInTheDocument();
    expect(container.querySelector(".editor-building")).toBeInTheDocument();
    expect(container.querySelector(".editor-transit-stop")).toBeInTheDocument();
    expect(container.querySelector(".editor-obstacle")).toBeInTheDocument();
    expect(container.querySelector(".editor-hazard.selected")).toBeInTheDocument();
  });
});
