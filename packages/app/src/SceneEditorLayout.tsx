import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import type { ChangeEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { HeatmapCell } from "./heatmap";
import type { Language, LocalizedText, TranslationKey } from "./i18n";
import { SceneEditorCanvas } from "./SceneEditorCanvas";
import { SceneEditorControls } from "./SceneEditorControls";
import { SceneEditorFloorBar } from "./SceneEditorFloorBar";
import { documentOnActiveFloor, editorBaseFloorId } from "./sceneEditorFloors";
import { SceneEditorParamPanel } from "./SceneEditorParamPanel";
import type { BasemapNumberField, EditorBasemap } from "./sceneEditorBasemap";
import type {
  EditorDocument,
  EditorTool,
  EditorZoneCategory,
} from "./sceneEditorState";
import type {
  BuildingNumberField,
  EntranceNumberField,
  HazardNumberField,
  ObstacleNumberField,
  RoadNumberField,
  TransitStopNumberField,
  ZoneNumberField,
} from "./sceneEditorMutations";
import type { SceneImageOverlay } from "./sceneEditorImageOverlay";
import { pointsToSvg } from "./sceneEditorUtils";
import type { LiveCrowd } from "./liveCrowd";

/** Nothing measured belongs on a floor the run never simulated. */
const noHeatmapCells: readonly HeatmapCell[] = [];

type SceneEditorLayoutProps = {
  /** Kept mounted while the stage shows another view, so work is not lost. */
  hidden?: boolean;
  /** Set when the live scene changed underneath unapplied edits. */
  onReloadLiveScene?: () => void;
  aiImageOverlay: SceneImageOverlay | null;
  templatePrompt: string;
  baseScene: CrowdSimScene;
  basemap: EditorBasemap | null;
  basemapInputRef: RefObject<HTMLInputElement | null>;
  canLoadSavedScene: boolean;
  canRedo: boolean;
  canUndo: boolean;
  document: EditorDocument;
  draftWallPoints: ScenePoint[];
  /** A count line being dragged out, or null when none is. */
  draftCountLine: { end: ScenePoint; start: ScenePoint } | null;
  dxfInputRef: RefObject<HTMLInputElement | null>;
  ifcInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  geoJsonInputRef: RefObject<HTMLInputElement | null>;
  gridSize: number;
  language: Language;
  crowd?: LiveCrowd;
  onTemplateDraft: () => void;
  onTemplatePromptChange: (value: string) => void;
  onAddFloor: () => void;
  onApplyScene: () => void;
  onBasemapImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onBasemapNumberChange: (field: BasemapNumberField, value: number) => void;
  onBuildingKindChange: (kind: EditorDocument["buildings"][number]["kind"]) => void;
  onBuildingNumberChange: (field: BuildingNumberField, value: number) => void;
  onConnectorCapacityChange: (value: number) => void;
  onConnectorCarCountChange: (value: number) => void;
  onConnectorDoorSecondsChange: (value: number) => void;
  onConnectorKindChange: (kind: EditorDocument["connectors"][number]["kind"]) => void;
  onConnectorWidthChange: (value: number) => void;
  onToggleConnectorBidirectional: () => void;
  onCountLineNameChange: (name: string) => void;
  onEntranceKindChange: (kind: EditorDocument["entrances"][number]["kind"]) => void;
  onEntrancePopulationChange: (populationId: string) => void;
  onEntranceProfileChange: (text: string) => void;
  onEntranceNumberChange: (field: EntranceNumberField, value: number) => void;
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onCountLineEndpointPointerDown: (
    event: ReactPointerEvent<SVGElement>,
    id: string,
    end: 0 | 1,
  ) => void;
  onDeleteSelected: () => void;
  onDxfImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onIfcImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onEntityPointerDown: (event: ReactPointerEvent<SVGElement>, id: string) => void;
  onExportScene: () => void;
  onFinishWall: () => void;
  onGeoJsonImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportScene: (event: ChangeEvent<HTMLInputElement>) => void;
  onShowTracingFixture: () => void;
  onHazardKindChange: (kind: EditorDocument["hazards"][number]["kind"]) => void;
  onHazardNumberChange: (field: HazardNumberField, value: number) => void;
  onLoadSavedScene: () => void;
  onObstacleKindChange: (kind: EditorDocument["obstacles"][number]["kind"]) => void;
  onObstacleNumberChange: (field: ObstacleNumberField, value: number) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onRedo: () => void;
  onResetDraftWall: () => void;
  onRoadDirectionChange: (
    direction: EditorDocument["roads"][number]["direction"],
  ) => void;
  onRoadNumberChange: (field: RoadNumberField, value: number) => void;
  onSaveScene: () => void;
  onSceneChange: (sceneId: string) => void;
  onSelectFloor: (floorId: string) => void;
  onServiceNumberChange: (
    field: "capacityPerMinute" | "serviceMeanSeconds" | "width",
    value: number,
  ) => void;
  onShopNumberChange: (
    field: "attraction" | "capacity" | "dwellMeanSeconds",
    value: number,
  ) => void;
  onShopSizeChange: (field: "height" | "width", value: number) => void;
  onToggleSnap: () => void;
  onToggleEditorViewMode: () => void;
  onToggleBasemapLocked: () => void;
  onToggleBasemapVisible: () => void;
  onToggleObstacleBlocksMovement: () => void;
  onToggleRoadTransitOnly: () => void;
  onToggleRoadWalkable: () => void;
  onToggleZoneWalkable: () => void;
  onToggleTransitStopActive: () => void;
  onGenerateZoneStores: () => void;
  onToolChange: (tool: EditorTool) => void;
  onTransitStopKindChange: (
    kind: EditorDocument["transitStops"][number]["kind"],
  ) => void;
  onTransitStopNumberChange: (field: TransitStopNumberField, value: number) => void;
  onUndo: () => void;
  onZoneCategoryChange: (category: EditorZoneCategory) => void;
  onZoneNumberChange: (field: ZoneNumberField, value: number) => void;
  selectableScenes: readonly CrowdSimScene[];
  selectedBuilding: EditorDocument["buildings"][number] | undefined;
  selectedConnector: EditorDocument["connectors"][number] | undefined;
  selectedCountLine: EditorDocument["countLines"][number] | undefined;
  selectedEntrance: EditorDocument["entrances"][number] | undefined;
  selectedHazard: EditorDocument["hazards"][number] | undefined;
  selectedId: string | null;
  selectedLabel: string;
  selectedObstacle: EditorDocument["obstacles"][number] | undefined;
  selectedRoad: EditorDocument["roads"][number] | undefined;
  selectedServicePoint: EditorDocument["servicePoints"][number] | undefined;
  selectedShop: EditorDocument["shops"][number] | undefined;
  selectedTransitStop: EditorDocument["transitStops"][number] | undefined;
  selectedZone: EditorDocument["zones"][number] | undefined;
  snapEnabled: boolean;
  storageStatus: LocalizedText;
  svgRef: RefObject<SVGSVGElement | null>;
  t: (key: TranslationKey) => string;
  text: (value: LocalizedText) => string;
  tool: EditorTool;
  tools: readonly EditorTool[];
  visibleHeatmapCells: readonly HeatmapCell[];
  viewMode: "isometric" | "topDown";
};

export function SceneEditorLayout({
  hidden = false,
  onReloadLiveScene,
  aiImageOverlay,
  templatePrompt,
  baseScene,
  basemap,
  basemapInputRef,
  canLoadSavedScene,
  canRedo,
  canUndo,
  document,
  draftWallPoints,
  draftCountLine,
  dxfInputRef,
  ifcInputRef,
  fileInputRef,
  geoJsonInputRef,
  gridSize,
  language,
  crowd,
  onTemplateDraft,
  onTemplatePromptChange,
  onAddFloor,
  onApplyScene,
  onBasemapImport,
  onBasemapNumberChange,
  onBuildingKindChange,
  onBuildingNumberChange,
  onConnectorCapacityChange,
  onConnectorCarCountChange,
  onConnectorDoorSecondsChange,
  onConnectorKindChange,
  onConnectorWidthChange,
  onToggleConnectorBidirectional,
  onCountLineNameChange,
  onEntranceKindChange,
  onEntrancePopulationChange,
  onEntranceProfileChange,
  onEntranceNumberChange,
  onCanvasPointerDown,
  onCountLineEndpointPointerDown,
  onDeleteSelected,
  onDxfImport,
  onIfcImport,
  onEntityPointerDown,
  onExportScene,
  onFinishWall,
  onGeoJsonImport,
  onImportScene,
  onShowTracingFixture,
  onHazardKindChange,
  onHazardNumberChange,
  onLoadSavedScene,
  onObstacleKindChange,
  onObstacleNumberChange,
  onPointerMove,
  onPointerUp,
  onRedo,
  onResetDraftWall,
  onRoadDirectionChange,
  onRoadNumberChange,
  onSaveScene,
  onSceneChange,
  onSelectFloor,
  onServiceNumberChange,
  onShopNumberChange,
  onShopSizeChange,
  onToggleSnap,
  onToggleEditorViewMode,
  onToggleBasemapLocked,
  onToggleBasemapVisible,
  onToggleObstacleBlocksMovement,
  onToggleRoadTransitOnly,
  onToggleRoadWalkable,
  onToggleZoneWalkable,
  onToggleTransitStopActive,
  onGenerateZoneStores,
  onToolChange,
  onTransitStopKindChange,
  onTransitStopNumberChange,
  onUndo,
  onZoneCategoryChange,
  onZoneNumberChange,
  selectableScenes,
  selectedBuilding,
  selectedConnector,
  selectedCountLine,
  selectedEntrance,
  selectedHazard,
  selectedId,
  selectedLabel,
  selectedObstacle,
  selectedRoad,
  selectedServicePoint,
  selectedShop,
  selectedTransitStop,
  selectedZone,
  snapEnabled,
  storageStatus,
  svgRef,
  t,
  text,
  tool,
  tools,
  visibleHeatmapCells,
  viewMode,
}: SceneEditorLayoutProps) {
  const drawnFloor = documentOnActiveFloor(document);
  // The run simulates the lowest floor, so only that floor has a crowd to show.
  const showsSimulatedFloor =
    document.floors.length === 0 ||
    document.activeFloorId === editorBaseFloorId(document);

  return (
    <section className="scene-editor" aria-label={t("sceneEditor")} hidden={hidden}>
      {onReloadLiveScene ? (
        <div
          className="editor-stale-banner"
          role="alert"
          data-testid="editor-stale-banner"
        >
          <span>{t("sceneChangedElsewhere")}</span>
          <button
            type="button"
            data-testid="editor-reload-live-scene"
            onClick={onReloadLiveScene}
          >
            {t("reloadLiveScene")}
          </button>
        </div>
      ) : null}
      <SceneEditorControls
        baseSceneId={baseScene.id}
        basemapInputRef={basemapInputRef}
        canDelete={Boolean(selectedId)}
        canLoadSavedScene={canLoadSavedScene}
        canRedo={canRedo}
        canUndo={canUndo}
        documentCounts={countDocumentObjects(drawnFloor)}
        dxfInputRef={dxfInputRef}
        ifcInputRef={ifcInputRef}
        fileInputRef={fileInputRef}
        geoJsonInputRef={geoJsonInputRef}
        language={language}
        templatePrompt={templatePrompt}
        onTemplateDraft={onTemplateDraft}
        onTemplatePromptChange={onTemplatePromptChange}
        onApplyScene={onApplyScene}
        onBasemapImport={onBasemapImport}
        onDeleteSelected={onDeleteSelected}
        onDxfImport={onDxfImport}
        onIfcImport={onIfcImport}
        onExportScene={onExportScene}
        onGeoJsonImport={onGeoJsonImport}
        onImportScene={onImportScene}
        onShowTracingFixture={onShowTracingFixture}
        onLoadSavedScene={onLoadSavedScene}
        onRedo={onRedo}
        onSaveScene={onSaveScene}
        onSceneChange={onSceneChange}
        onToggleSnap={onToggleSnap}
        onToggleEditorViewMode={onToggleEditorViewMode}
        onToolChange={onToolChange}
        onUndo={onUndo}
        selectableScenes={selectableScenes}
        selectedLabel={selectedLabel}
        snapEnabled={snapEnabled}
        storageStatus={storageStatus}
        t={t}
        text={text}
        tool={tool}
        tools={tools}
        viewMode={viewMode}
      />

      <SceneEditorFloorBar
        document={document}
        onAddFloor={onAddFloor}
        onSelectFloor={onSelectFloor}
        t={t}
      />

      <SceneEditorCanvas
        aiImageOverlay={aiImageOverlay}
        baseScene={baseScene}
        basemap={basemap}
        document={drawnFloor}
        draftWallPoints={draftWallPoints}
        draftCountLine={draftCountLine}
        gridSize={gridSize}
        crowd={showsSimulatedFloor ? crowd : undefined}
        onCanvasPointerDown={onCanvasPointerDown}
        onCountLineEndpointPointerDown={onCountLineEndpointPointerDown}
        onEntityPointerDown={onEntityPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        selectedId={selectedId}
        svgRef={svgRef}
        t={t}
        visibleHeatmapCells={showsSimulatedFloor ? visibleHeatmapCells : noHeatmapCells}
        viewMode={viewMode}
      />

      <SceneEditorParamPanel
        basemap={basemap}
        onBasemapNumberChange={onBasemapNumberChange}
        onBuildingKindChange={onBuildingKindChange}
        onBuildingNumberChange={onBuildingNumberChange}
        onConnectorCapacityChange={onConnectorCapacityChange}
        onConnectorCarCountChange={onConnectorCarCountChange}
        onConnectorDoorSecondsChange={onConnectorDoorSecondsChange}
        onConnectorKindChange={onConnectorKindChange}
        onConnectorWidthChange={onConnectorWidthChange}
        onToggleConnectorBidirectional={onToggleConnectorBidirectional}
        onCountLineNameChange={onCountLineNameChange}
        onEntranceKindChange={onEntranceKindChange}
        onEntrancePopulationChange={onEntrancePopulationChange}
        onEntranceProfileChange={onEntranceProfileChange}
        onEntranceNumberChange={onEntranceNumberChange}
        onHazardKindChange={onHazardKindChange}
        onHazardNumberChange={onHazardNumberChange}
        onObstacleKindChange={onObstacleKindChange}
        onObstacleNumberChange={onObstacleNumberChange}
        onRoadDirectionChange={onRoadDirectionChange}
        onRoadNumberChange={onRoadNumberChange}
        onServiceNumberChange={onServiceNumberChange}
        onShopNumberChange={onShopNumberChange}
        onShopSizeChange={onShopSizeChange}
        onToggleObstacleBlocksMovement={onToggleObstacleBlocksMovement}
        onToggleRoadTransitOnly={onToggleRoadTransitOnly}
        onToggleRoadWalkable={onToggleRoadWalkable}
        onToggleBasemapLocked={onToggleBasemapLocked}
        onToggleBasemapVisible={onToggleBasemapVisible}
        onToggleTransitStopActive={onToggleTransitStopActive}
        onToggleZoneWalkable={onToggleZoneWalkable}
        onGenerateZoneStores={onGenerateZoneStores}
        onTransitStopKindChange={onTransitStopKindChange}
        onTransitStopNumberChange={onTransitStopNumberChange}
        onZoneCategoryChange={onZoneCategoryChange}
        onZoneNumberChange={onZoneNumberChange}
        pointsToSvg={pointsToSvg}
        selectedBuilding={selectedBuilding}
        selectedConnector={selectedConnector}
        selectedCountLine={selectedCountLine}
        selectedEntrance={selectedEntrance}
        selectedHazard={selectedHazard}
        selectedObstacle={selectedObstacle}
        selectedRoad={selectedRoad}
        selectedServicePoint={selectedServicePoint}
        selectedShop={selectedShop}
        selectedTransitStop={selectedTransitStop}
        selectedZone={selectedZone}
        t={t}
      />

      <DraftWallActions
        canFinish={draftWallPoints.length >= 2}
        onFinishWall={onFinishWall}
        onResetDraftWall={onResetDraftWall}
        t={t}
        visible={tool === "wall"}
      />
    </section>
  );
}

function countDocumentObjects(document: EditorDocument) {
  return {
    buildings: document.buildings.length,
    countLines: document.countLines.length,
    entrances: document.entrances.length,
    hazards: document.hazards.length,
    obstacles: document.obstacles.length,
    roads: document.roads.length,
    servicePoints: document.servicePoints.length,
    shops: document.shops.length,
    targets: document.targets.length,
    transitStops: document.transitStops.length,
    walls: document.walls.length,
    zones: document.zones.length,
  };
}

function DraftWallActions({
  canFinish,
  onFinishWall,
  onResetDraftWall,
  t,
  visible,
}: {
  canFinish: boolean;
  onFinishWall: () => void;
  onResetDraftWall: () => void;
  t: (key: TranslationKey) => string;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="editor-draft-actions">
      <button type="button" onClick={onFinishWall} disabled={!canFinish}>
        {t("finishWall")}
      </button>
      <button type="button" onClick={onResetDraftWall}>
        {t("cancelWall")}
      </button>
    </div>
  );
}
