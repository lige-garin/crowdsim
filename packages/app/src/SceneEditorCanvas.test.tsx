import { createRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoScene } from "./demoScene";
import { SceneEditorCanvas } from "./SceneEditorCanvas";
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
        liveAgents={[
          {
            id: 7,
            targetX: 76,
            targetY: 24,
            vx: 1.5,
            vy: -0.5,
            x: 8,
            y: 44,
          },
        ]}
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
});
