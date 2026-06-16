import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import type { ChangeEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { ImageGeometryDraft, ImageScaleCalibration } from "./aiImageGeometry";
import type { HeatmapCell } from "./heatmap";
import type { Language, LocalizedText, TranslationKey } from "./i18n";
import { SceneEditorCanvas } from "./SceneEditorCanvas";
import { SceneEditorControls } from "./SceneEditorControls";
import { SceneEditorParamPanel } from "./SceneEditorParamPanel";
import type { BasemapNumberField, EditorBasemap } from "./sceneEditorBasemap";
import type {
  EditorDocument,
  EditorTool,
  EditorZoneCategory,
} from "./sceneEditorState";
import type {
  BuildingNumberField,
  HazardNumberField,
  ObstacleNumberField,
  RoadNumberField,
  TransitStopNumberField,
  ZoneNumberField,
} from "./sceneEditorMutations";
import { pointsToSvg } from "./sceneEditorUtils";
import type { SimulationAgent } from "./simulationEngine";

type AiImageOverlayState = {
  calibration: ImageScaleCalibration;
  draft: ImageGeometryDraft;
} | null;

type SceneEditorLayoutProps = {
  aiImageOverlay: AiImageOverlayState;
  baseScene: CrowdSimScene;
  basemap: EditorBasemap | null;
  basemapInputRef: RefObject<HTMLInputElement | null>;
  canLoadSavedScene: boolean;
  canRedo: boolean;
  canUndo: boolean;
  document: EditorDocument;
  draftWallPoints: ScenePoint[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  geoJsonInputRef: RefObject<HTMLInputElement | null>;
  gridSize: number;
  language: Language;
  liveAgents: readonly SimulationAgent[];
  onAiDraft: () => void;
  onBasemapImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onBasemapNumberChange: (field: BasemapNumberField, value: number) => void;
  onBuildingKindChange: (kind: EditorDocument["buildings"][number]["kind"]) => void;
  onBuildingNumberChange: (field: BuildingNumberField, value: number) => void;
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onDeleteSelected: () => void;
  onEntityPointerDown: (event: ReactPointerEvent<SVGElement>, id: string) => void;
  onExportScene: () => void;
  onFinishWall: () => void;
  onGeoJsonImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportScene: (event: ChangeEvent<HTMLInputElement>) => void;
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
  selectedCountLine: EditorDocument["countLines"][number] | undefined;
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
  aiImageOverlay,
  baseScene,
  basemap,
  basemapInputRef,
  canLoadSavedScene,
  canRedo,
  canUndo,
  document,
  draftWallPoints,
  fileInputRef,
  geoJsonInputRef,
  gridSize,
  language,
  liveAgents,
  onAiDraft,
  onBasemapImport,
  onBasemapNumberChange,
  onBuildingKindChange,
  onBuildingNumberChange,
  onCanvasPointerDown,
  onDeleteSelected,
  onEntityPointerDown,
  onExportScene,
  onFinishWall,
  onGeoJsonImport,
  onImportScene,
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
  selectedCountLine,
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
  return (
    <section className="scene-editor" aria-label={t("sceneEditor")}>
      <SceneEditorControls
        baseSceneId={baseScene.id}
        basemapInputRef={basemapInputRef}
        canDelete={Boolean(selectedId)}
        canLoadSavedScene={canLoadSavedScene}
        canRedo={canRedo}
        canUndo={canUndo}
        documentCounts={countDocumentObjects(document)}
        fileInputRef={fileInputRef}
        geoJsonInputRef={geoJsonInputRef}
        language={language}
        onAiDraft={onAiDraft}
        onBasemapImport={onBasemapImport}
        onDeleteSelected={onDeleteSelected}
        onExportScene={onExportScene}
        onGeoJsonImport={onGeoJsonImport}
        onImportScene={onImportScene}
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

      <SceneEditorCanvas
        aiImageOverlay={aiImageOverlay}
        baseScene={baseScene}
        basemap={basemap}
        document={document}
        draftWallPoints={draftWallPoints}
        gridSize={gridSize}
        liveAgents={liveAgents}
        onCanvasPointerDown={onCanvasPointerDown}
        onEntityPointerDown={onEntityPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        selectedId={selectedId}
        svgRef={svgRef}
        t={t}
        visibleHeatmapCells={visibleHeatmapCells}
        viewMode={viewMode}
      />

      <SceneEditorParamPanel
        basemap={basemap}
        onBasemapNumberChange={onBasemapNumberChange}
        onBuildingKindChange={onBuildingKindChange}
        onBuildingNumberChange={onBuildingNumberChange}
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
        selectedCountLine={selectedCountLine}
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
