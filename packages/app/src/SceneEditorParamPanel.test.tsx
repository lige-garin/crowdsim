import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { SceneEditorParamPanel } from "./SceneEditorParamPanel";
import { createEditorDocumentFromScene } from "./sceneEditorState";

afterEach(() => {
  cleanup();
});

describe("SceneEditorParamPanel", () => {
  it("renders and wires road BioCity controls", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const onRoadDirectionChange = vi.fn();
    const onRoadNumberChange = vi.fn();
    const onToggleRoadTransitOnly = vi.fn();

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onRoadDirectionChange={onRoadDirectionChange}
        onRoadNumberChange={onRoadNumberChange}
        onToggleRoadTransitOnly={onToggleRoadTransitOnly}
        selectedRoad={document.roads[0]}
      />,
    );

    fireEvent.change(screen.getByLabelText("roadDirection"), {
      target: { value: "oneWayForward" },
    });
    fireEvent.change(screen.getByLabelText("roadWidth"), {
      target: { value: "14" },
    });
    fireEvent.click(screen.getByRole("button", { name: "mixedTraffic" }));

    expect(onRoadDirectionChange).toHaveBeenCalledWith("oneWayForward");
    expect(onRoadNumberChange).toHaveBeenCalledWith("widthMeters", 14);
    expect(onToggleRoadTransitOnly).toHaveBeenCalled();
  });

  it("renders and wires hazard BioCity controls", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const onHazardKindChange = vi.fn();
    const onHazardNumberChange = vi.fn();

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onHazardKindChange={onHazardKindChange}
        onHazardNumberChange={onHazardNumberChange}
        selectedHazard={document.hazards[0]}
      />,
    );

    fireEvent.change(screen.getByLabelText("hazardKind"), {
      target: { value: "smoke" },
    });
    fireEvent.change(screen.getByLabelText("severity"), {
      target: { value: "0.9" },
    });

    expect(onHazardKindChange).toHaveBeenCalledWith("smoke");
    expect(onHazardNumberChange).toHaveBeenCalledWith("severity", 0.9);
  });
});

function baseProps(): Parameters<typeof SceneEditorParamPanel>[0] {
  return {
    basemap: null,
    onBasemapNumberChange: vi.fn(),
    onBuildingKindChange: vi.fn(),
    onBuildingNumberChange: vi.fn(),
    onHazardKindChange: vi.fn(),
    onHazardNumberChange: vi.fn(),
    onObstacleKindChange: vi.fn(),
    onObstacleNumberChange: vi.fn(),
    onRoadDirectionChange: vi.fn(),
    onRoadNumberChange: vi.fn(),
    onServiceNumberChange: vi.fn(),
    onShopNumberChange: vi.fn(),
    onShopSizeChange: vi.fn(),
    onToggleBasemapLocked: vi.fn(),
    onToggleBasemapVisible: vi.fn(),
    onToggleObstacleBlocksMovement: vi.fn(),
    onToggleRoadTransitOnly: vi.fn(),
    onToggleRoadWalkable: vi.fn(),
    onToggleTransitStopActive: vi.fn(),
    onToggleZoneWalkable: vi.fn(),
    onGenerateZoneStores: vi.fn(),
    onTransitStopKindChange: vi.fn(),
    onTransitStopNumberChange: vi.fn(),
    onZoneCategoryChange: vi.fn(),
    onZoneNumberChange: vi.fn(),
    pointsToSvg: (points) => points.map((point) => `${point.x},${point.y}`).join(" "),
    selectedBuilding: undefined,
    selectedCountLine: undefined,
    selectedHazard: undefined,
    selectedObstacle: undefined,
    selectedRoad: undefined,
    selectedServicePoint: undefined,
    selectedShop: undefined,
    selectedTransitStop: undefined,
    selectedZone: undefined,
    t: (key) => key,
  };
}
