import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { SceneEditorParamPanel } from "./SceneEditorParamPanel";
import { createEditorDocumentFromScene } from "./sceneEditorState";

afterEach(() => {
  cleanup();
});

describe("SceneEditorParamPanel", () => {
  /**
   * Entrances were the one drawable object with no parameter editor: selecting
   * one showed "no object selected" and zero fields, so arrival rate — the most
   * consequential input in a crowd model — could only be changed by editing
   * JSON by hand.
   */
  it("edits the arrival rate and kind of a selected entrance", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const source = document.entrances.find((entrance) => entrance.kind === "source");
    const onEntranceNumberChange = vi.fn();
    const onEntranceKindChange = vi.fn();
    const onEntranceProfileChange = vi.fn();

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onEntranceKindChange={onEntranceKindChange}
        onEntranceNumberChange={onEntranceNumberChange}
        onEntranceProfileChange={onEntranceProfileChange}
        selectedEntrance={source}
      />,
    );

    fireEvent.change(screen.getByLabelText("arrivalRate"), {
      target: { value: "600" },
    });
    fireEvent.change(screen.getByLabelText("width"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("groupShare"), { target: { value: "0.5" } });
    const profile = screen.getByLabelText("arrivalProfile");
    fireEvent.change(profile, { target: { value: "60, 120" } });
    // Committed when the field is left, not on every keystroke.
    expect(onEntranceProfileChange).not.toHaveBeenCalled();
    fireEvent.blur(profile);
    expect(onEntranceProfileChange).toHaveBeenCalledWith("60, 120");
    fireEvent.change(screen.getByLabelText("entranceKind"), {
      target: { value: "bidirectional" },
    });

    expect(onEntranceNumberChange).toHaveBeenCalledWith("arrivalRatePerMinute", 600);
    expect(onEntranceNumberChange).toHaveBeenCalledWith("width", 12);
    expect(onEntranceNumberChange).toHaveBeenCalledWith("groupShare", 0.5);
    expect(onEntranceKindChange).toHaveBeenCalledWith("bidirectional");
  });

  it("does not offer an arrival rate on an exit, which cannot spawn anyone", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const sink = document.entrances.find((entrance) => entrance.kind === "sink");
    expect(sink, "demo scene must have an exit").toBeDefined();

    render(<SceneEditorParamPanel {...baseProps()} selectedEntrance={sink} />);

    expect(screen.queryByLabelText("arrivalRate")).not.toBeInTheDocument();
    expect(screen.getByLabelText("width")).toBeInTheDocument();
  });

  it("renders and wires road BioCity controls", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const onRoadDirectionChange = vi.fn();
    const onRoadNumberChange = vi.fn();
    const onToggleRoadTransitOnly = vi.fn();
    const onToggleRoadVehicleAccessible = vi.fn();
    // The demo scene declares no vehicle-accessible roads (schema default
    // false, ADR-0016/0020), so this road starts blocked to traffic.
    expect(document.roads[0].vehicleAccessible).toBe(false);

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onRoadDirectionChange={onRoadDirectionChange}
        onRoadNumberChange={onRoadNumberChange}
        onToggleRoadTransitOnly={onToggleRoadTransitOnly}
        onToggleRoadVehicleAccessible={onToggleRoadVehicleAccessible}
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
    fireEvent.click(screen.getByRole("button", { name: "vehicleBlocked" }));

    expect(onRoadDirectionChange).toHaveBeenCalledWith("oneWayForward");
    expect(onRoadNumberChange).toHaveBeenCalledWith("widthMeters", 14);
    expect(onToggleRoadTransitOnly).toHaveBeenCalled();
    expect(onToggleRoadVehicleAccessible).toHaveBeenCalled();
    // Vehicle arrival-rate/speed-limit inputs only make sense once a road is
    // vehicle-accessible — hidden here, covered by the next test.
    expect(screen.queryByLabelText("vehicleArrivalRate")).not.toBeInTheDocument();
  });

  it("edits a vehicle-accessible road's traffic fields (ADR-0016/0020)", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const onRoadNumberChange = vi.fn();
    const vehicleRoad = {
      ...document.roads[0],
      vehicleAccessible: true,
      vehicleArrivalRatePerMinute: 6,
      vehicleSpeedLimitMetersPerSecond: 8.33,
    };

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onRoadNumberChange={onRoadNumberChange}
        selectedRoad={vehicleRoad}
      />,
    );

    expect(screen.getByRole("button", { name: "vehicleAccessible" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("vehicleArrivalRate"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("vehicleSpeedLimit"), {
      target: { value: "10" },
    });

    expect(onRoadNumberChange).toHaveBeenCalledWith("vehicleArrivalRatePerMinute", 12);
    expect(onRoadNumberChange).toHaveBeenCalledWith(
      "vehicleSpeedLimitMetersPerSecond",
      10,
    );
  });

  it("renders and wires a crosswalk's road dropdown and width (ADR-0020)", () => {
    const document = createEditorDocumentFromScene(bioCityDemoScene);
    const onCrosswalkNumberChange = vi.fn();
    const onCrosswalkRoadIdChange = vi.fn();
    const otherRoadId = "road-elsewhere";
    const crosswalk = {
      id: "crosswalk-1",
      roadId: document.roads[0].id,
      position: { x: 10, y: 10 },
      widthMeters: 3,
    };

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onCrosswalkNumberChange={onCrosswalkNumberChange}
        onCrosswalkRoadIdChange={onCrosswalkRoadIdChange}
        roadIds={[document.roads[0].id, otherRoadId]}
        selectedCrosswalk={crosswalk}
      />,
    );

    fireEvent.change(screen.getByLabelText("crosswalkRoad"), {
      target: { value: otherRoadId },
    });
    fireEvent.change(screen.getByLabelText("crosswalkWidth"), {
      target: { value: "5" },
    });

    expect(onCrosswalkRoadIdChange).toHaveBeenCalledWith(otherRoadId);
    expect(onCrosswalkNumberChange).toHaveBeenCalledWith("widthMeters", 5);
  });

  it("chains a service point to another and edits its outage windows (ADR-0021)", () => {
    const onServiceNextIdChange = vi.fn();
    const onServiceOutageWindowsChange = vi.fn();
    const servicePoint = {
      id: "security",
      kind: "gate" as const,
      position: { x: 5, y: 5 },
      width: 3,
      serviceMeanSeconds: 8,
      capacityPerMinute: 60,
      outageWindows: [],
    };

    render(
      <SceneEditorParamPanel
        {...baseProps()}
        onServiceNextIdChange={onServiceNextIdChange}
        onServiceOutageWindowsChange={onServiceOutageWindowsChange}
        otherServicePointIds={["ticket-gate"]}
        selectedServicePoint={servicePoint}
      />,
    );

    fireEvent.change(screen.getByLabelText("nextServicePoint"), {
      target: { value: "ticket-gate" },
    });
    expect(onServiceNextIdChange).toHaveBeenCalledWith("ticket-gate");

    const outage = screen.getByLabelText("outageWindows");
    fireEvent.change(outage, { target: { value: "600-900" } });
    expect(onServiceOutageWindowsChange).not.toHaveBeenCalled();
    fireEvent.blur(outage);
    expect(onServiceOutageWindowsChange).toHaveBeenCalledWith("600-900");
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
    onConnectorCapacityChange: vi.fn(),
    onConnectorCarCountChange: vi.fn(),
    onConnectorDoorSecondsChange: vi.fn(),
    onConnectorKindChange: vi.fn(),
    onConnectorWidthChange: vi.fn(),
    onToggleConnectorBidirectional: vi.fn(),
    onCountLineNameChange: vi.fn(),
    onCrosswalkNumberChange: vi.fn(),
    onCrosswalkRoadIdChange: vi.fn(),
    onEntranceKindChange: vi.fn(),
    onEntrancePopulationChange: vi.fn(),
    onEntranceProfileChange: vi.fn(),
    onEntranceNumberChange: vi.fn(),
    onHazardKindChange: vi.fn(),
    onHazardNumberChange: vi.fn(),
    onObstacleKindChange: vi.fn(),
    onObstacleNumberChange: vi.fn(),
    onRoadDirectionChange: vi.fn(),
    onRoadNumberChange: vi.fn(),
    onServiceNumberChange: vi.fn(),
    onServiceNextIdChange: vi.fn(),
    onServiceOutageWindowsChange: vi.fn(),
    onShopNumberChange: vi.fn(),
    onShopSizeChange: vi.fn(),
    onToggleBasemapLocked: vi.fn(),
    onToggleBasemapVisible: vi.fn(),
    onToggleObstacleBlocksMovement: vi.fn(),
    onToggleRoadTransitOnly: vi.fn(),
    onToggleRoadVehicleAccessible: vi.fn(),
    onToggleRoadWalkable: vi.fn(),
    onToggleTransitStopActive: vi.fn(),
    onToggleZoneWalkable: vi.fn(),
    onGenerateZoneStores: vi.fn(),
    onTransitStopKindChange: vi.fn(),
    onTransitStopNumberChange: vi.fn(),
    onZoneCategoryChange: vi.fn(),
    onZoneNumberChange: vi.fn(),
    pointsToSvg: (points) => points.map((point) => `${point.x},${point.y}`).join(" "),
    roadIds: [],
    otherServicePointIds: [],
    selectedBuilding: undefined,
    selectedConnector: undefined,
    selectedCountLine: undefined,
    selectedCrosswalk: undefined,
    selectedEntrance: undefined,
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
