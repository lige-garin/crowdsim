import { createRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { defaultDemoScene } from "./defaultDemoScene";
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
        draftCountLine={null}
        onCountLineEndpointPointerDown={vi.fn()}
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

  it("renders scene roads, buildings, stops, obstacles, and hazards", () => {
    const { container } = render(
      <SceneEditorCanvas
        aiImageOverlay={null}
        baseScene={defaultDemoScene}
        basemap={null}
        document={createEditorDocumentFromScene(defaultDemoScene)}
        draftWallPoints={[]}
        draftCountLine={null}
        onCountLineEndpointPointerDown={vi.fn()}
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

  it("renders a crosswalk, selected when it is the selected entity (ADR-0020, previously not rendered at all)", () => {
    const scene = parseScene({
      ...defaultDemoScene,
      crosswalks: [
        {
          id: "crosswalk-test",
          roadId: defaultDemoScene.roads[0].id,
          position: { x: 5, y: 5 },
          widthMeters: 4,
        },
      ],
    });
    const { container } = render(
      <SceneEditorCanvas
        aiImageOverlay={null}
        baseScene={scene}
        basemap={null}
        document={createEditorDocumentFromScene(scene)}
        draftWallPoints={[]}
        draftCountLine={null}
        onCountLineEndpointPointerDown={vi.fn()}
        gridSize={2}
        onCanvasPointerDown={vi.fn()}
        onEntityPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        selectedId="crosswalk-test"
        svgRef={createRef<SVGSVGElement>()}
        t={(key) => key}
        visibleHeatmapCells={[]}
        viewMode="topDown"
      />,
    );

    expect(container.querySelector(".editor-crosswalk.selected")).toBeInTheDocument();
  });
});
