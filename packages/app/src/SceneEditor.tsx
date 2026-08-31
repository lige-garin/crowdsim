import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { createNaturalLanguageScenePlanDraft } from "./aiSceneAssistant";
import { templateScenes } from "./industryTemplates";
import { imageTracingFixtures } from "./imageTracingEvaluation";
import {
  createImportedImageOverlay,
  createTracingFixtureOverlay,
  type SceneImageOverlay,
} from "./sceneEditorImageOverlay";
import { createSceneFromGeoJson } from "./geojsonImport";
import { createSceneFromDxfWithReport } from "./dxfImport";
import type { HeatmapCell } from "./heatmap";
import { useI18n, type LocalizedText } from "./i18n";
import { SceneEditorLayout } from "./SceneEditorLayout";
import { addImportedBasemap, getActiveBasemap } from "./sceneEditorBasemap";
import {
  addBuilding,
  addCountLine,
  addEntrance,
  addHazard,
  addObstacle,
  addRoad,
  addServicePoint,
  addShop,
  addTarget,
  addTransitStop,
  addWall,
  addZone,
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
  editorTools,
  moveEntity,
  removeEntity,
  snapPoint,
  type EditorDocument,
  type EditorTool,
} from "./sceneEditorState";
import { downloadSceneJson } from "./sceneFileExport";
import { createSceneEditorParamActions } from "./SceneEditorParamActions";
import { fileNameValues, makeStatus, sceneNameValues } from "./sceneEditorStatus";
import { clamp, readFileAsDataUrl } from "./sceneEditorUtils";
import type { SimulationSnapshot } from "./simulationEngine";
type DragState = {
  before: EditorDocument;
  id: string;
  lastPoint: ScenePoint;
  moved: boolean;
};
const gridSize = 2;
const storageKey = "crowdsim.scene.v1";
export function SceneEditor({
  heatmapCells = [],
  onApplyScene,
  onToolChange,
  scene,
  simulationSnapshot,
  tool: controlledTool,
}: {
  heatmapCells?: readonly HeatmapCell[];
  /**
   * Called with the editor's working scene when the user explicitly asks to
   * apply it. Deliberately NOT called on every edit: restarting the simulation
   * for each drawn primitive would make the editor unusable.
   */
  onApplyScene?: (scene: CrowdSimScene) => void;
  /** Notified whenever the active tool changes, including internal resets. */
  onToolChange?: (tool: EditorTool) => void;
  scene: CrowdSimScene;
  simulationSnapshot?: SimulationSnapshot;
  /** Optional controlled tool, so a shell toolbar can drive the editor. */
  tool?: EditorTool;
}) {
  const { language, t, text } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geoJsonInputRef = useRef<HTMLInputElement | null>(null);
  const basemapInputRef = useRef<HTMLInputElement | null>(null);
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [baseScene, setBaseScene] = useState(scene);
  const [aiImageOverlay, setAiImageOverlay] = useState<SceneImageOverlay | null>(null);
  const [templatePrompt, setAiPrompt] = useState("");
  const [document, setDocument] = useState(() => createEditorDocumentFromScene(scene));
  const [draftWallPoints, setDraftWallPoints] = useState<ScenePoint[]>([]);
  const [redoStack, setRedoStack] = useState<EditorDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [storageStatus, setStorageStatus] = useState<LocalizedText>(() =>
    makeStatus("ready"),
  );
  const [uncontrolledTool, setUncontrolledTool] = useState<EditorTool>("select");
  // Controlled when the shell passes a tool, uncontrolled otherwise. Internal
  // resets (scene swap, delete) still route through setTool so the shell's
  // highlighted tool never drifts from the editor's real one.
  const tool = controlledTool ?? uncontrolledTool;
  const [undoStack, setUndoStack] = useState<EditorDocument[]>([]);
  const [hasSavedScene, setHasSavedScene] = useState(() =>
    typeof localStorage === "undefined"
      ? false
      : localStorage.getItem(storageKey) !== null,
  );
  function setTool(nextTool: EditorTool) {
    setUncontrolledTool(nextTool);
    onToolChange?.(nextTool);
  }
  const selectedLabel = selectedId ?? t("none");
  const currentScene = useMemo(
    () => createSceneFromEditorDocument(baseScene, document),
    [baseScene, document],
  );
  const activeBasemap = getActiveBasemap(currentScene);
  const selectableScenes = useMemo(() => {
    const scenes = [scene, ...templateScenes];
    if (scenes.some((candidate) => candidate.id === baseScene.id)) {
      return scenes;
    }
    return [baseScene, ...scenes];
  }, [baseScene, scene]);
  const visibleHeatmapCells = baseScene.id === scene.id ? heatmapCells : [];
  const visibleLiveAgents =
    baseScene.id === scene.id ? (simulationSnapshot?.agents ?? []) : [];
  const selectedShop = document.shops.find((shop) => shop.id === selectedId);
  const selectedRoad = document.roads.find((road) => road.id === selectedId);
  const selectedBuilding = document.buildings.find(
    (building) => building.id === selectedId,
  );
  const selectedTransitStop = document.transitStops.find(
    (stop) => stop.id === selectedId,
  );
  const selectedObstacle = document.obstacles.find(
    (obstacle) => obstacle.id === selectedId,
  );
  const selectedHazard = document.hazards.find((hazard) => hazard.id === selectedId);
  const selectedZone = document.zones.find((zone) => zone.id === selectedId);
  const selectedServicePoint = document.servicePoints.find(
    (point) => point.id === selectedId,
  );
  const selectedCountLine = document.countLines.find((line) => line.id === selectedId);
  function replaceScene(nextScene: CrowdSimScene, status: LocalizedText) {
    setBaseScene(nextScene);
    setDocument(createEditorDocumentFromScene(nextScene));
    // The overlay describes one specific image; it says nothing about the next
    // scene's basemap, so it does not survive a scene swap.
    setAiImageOverlay(null);
    setDraftWallPoints([]);
    setRedoStack([]);
    setSelectedId(null);
    setStorageStatus(status);
    setTool("select");
    setUndoStack([]);
  }
  function applySceneToSimulation() {
    // Hand the editor's working copy upward; the shell owns the live scene and
    // re-inits the simulation with it.
    onApplyScene?.(currentScene);
    setStorageStatus(makeStatus("sceneApplied"));
  }
  function switchTool(nextTool: EditorTool) {
    setTool(nextTool);
    setDraftWallPoints([]);
  }
  function commit(nextDocument: EditorDocument) {
    setUndoStack((stack) => [...stack, document]);
    setRedoStack([]);
    setDocument(nextDocument);
  }
  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) {
      return;
    }
    setRedoStack((stack) => [...stack, document]);
    setUndoStack((stack) => stack.slice(0, -1));
    setDocument(previous);
    setSelectedId(null);
    setDraftWallPoints([]);
  }
  function redo() {
    const next = redoStack.at(-1);
    if (!next) {
      return;
    }
    setUndoStack((stack) => [...stack, document]);
    setRedoStack((stack) => stack.slice(0, -1));
    setDocument(next);
    setSelectedId(null);
    setDraftWallPoints([]);
  }
  function deleteSelected() {
    if (!selectedId) {
      return;
    }
    commit(removeEntity(document, selectedId));
    setSelectedId(null);
  }
  function pointFromEvent(event: ReactPointerEvent<SVGElement>) {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }
    const point = svg.createSVGPoint();
    const transform = svg.getScreenCTM();
    point.x = event.clientX;
    point.y = event.clientY;
    if (!transform) {
      return snapPoint({ x: point.x, y: point.y }, gridSize, snapEnabled);
    }
    const editorPoint = point.matrixTransform(transform.inverse());
    return snapPoint(
      {
        x: clamp(editorPoint.x, 0, baseScene.world.width),
        y: clamp(editorPoint.y, 0, baseScene.world.height),
      },
      gridSize,
      snapEnabled,
    );
  }
  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointFromEvent(event);
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    if (tool === "wall") {
      setDraftWallPoints((points) => [...points, point]);
      return;
    }
    if (tool === "zone") {
      commit(addZone(document, point));
      return;
    }
    if (tool === "road") {
      commit(addRoad(document, point));
      return;
    }
    if (tool === "building") {
      commit(addBuilding(document, point));
      return;
    }
    if (tool === "source" || tool === "sink") {
      commit(addEntrance(document, tool, point));
      return;
    }
    if (tool === "shop") {
      commit(addShop(document, point));
      return;
    }
    if (tool === "transitStop") {
      commit(addTransitStop(document, point));
      return;
    }
    if (tool === "counter" || tool === "gate") {
      commit(addServicePoint(document, tool, point));
      return;
    }
    if (tool === "obstacle") {
      commit(addObstacle(document, point));
      return;
    }
    if (tool === "hazard") {
      commit(addHazard(document, point));
      return;
    }
    if (tool === "countLine") {
      commit(addCountLine(document, point));
      return;
    }
    commit(addTarget(document, point));
  }
  function handleEntityPointerDown(event: ReactPointerEvent<SVGElement>, id: string) {
    if (tool !== "select") {
      return;
    }
    event.stopPropagation();
    setSelectedId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      before: document,
      id,
      lastPoint: pointFromEvent(event),
      moved: false,
    };
  }
  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragState.current;
    if (!drag) {
      return;
    }
    const nextPoint = pointFromEvent(event);
    const delta = {
      x: nextPoint.x - drag.lastPoint.x,
      y: nextPoint.y - drag.lastPoint.y,
    };
    if (delta.x === 0 && delta.y === 0) {
      return;
    }
    drag.lastPoint = nextPoint;
    drag.moved = true;
    setDocument((current) => moveEntity(current, drag.id, delta));
  }
  function handlePointerUp() {
    const drag = dragState.current;
    if (!drag) {
      return;
    }
    if (drag.moved) {
      setUndoStack((stack) => [...stack, drag.before]);
      setRedoStack([]);
    }
    dragState.current = null;
  }
  function finishWall() {
    if (draftWallPoints.length < 2) {
      return;
    }
    commit(addWall(document, draftWallPoints));
    setDraftWallPoints([]);
    setTool("select");
  }
  function selectExampleScene(sceneId: string) {
    const nextScene = selectableScenes.find((candidate) => candidate.id === sceneId);
    if (nextScene) {
      replaceScene(nextScene, makeStatus("loadedScene", sceneNameValues(nextScene)));
    }
  }
  function saveScene() {
    localStorage.setItem(storageKey, JSON.stringify(currentScene, null, 2));
    setHasSavedScene(true);
    setStorageStatus(makeStatus("savedLocally"));
  }
  function loadSavedScene() {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      setStorageStatus(makeStatus("noSavedScene"));
      return;
    }
    try {
      replaceScene(parseScene(JSON.parse(stored)), makeStatus("loadedSavedScene"));
    } catch {
      setStorageStatus(makeStatus("savedSceneInvalid"));
    }
  }
  function exportScene() {
    downloadSceneJson(currentScene);
    setStorageStatus(makeStatus("exportedScene"));
  }
  async function importScene(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      replaceScene(
        parseScene(JSON.parse(await file.text())),
        makeStatus("importedFile", fileNameValues(file.name)),
      );
    } catch {
      setStorageStatus(makeStatus("importInvalid"));
    } finally {
      event.target.value = "";
    }
  }
  async function importGeoJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      replaceScene(
        createSceneFromGeoJson(currentScene, JSON.parse(await file.text())),
        makeStatus("importedFile", fileNameValues(file.name)),
      );
    } catch {
      setStorageStatus(makeStatus("geoJsonInvalid"));
    } finally {
      event.target.value = "";
    }
  }
  async function importDxf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const result = createSceneFromDxfWithReport(currentScene, await file.text());

      if (result.wallCount === 0) {
        setStorageStatus(makeStatus("dxfInvalid"));
        return;
      }

      replaceScene(
        result.scene,
        makeStatus("dxfImportedWalls", {
          en: { count: result.wallCount },
          zh: { count: result.wallCount },
        }),
      );

      // Entity types we could not convert are reported rather than dropped
      // silently: a plan that comes in missing its arcs is a different plan.
      if (result.skippedEntityTypes.length > 0) {
        setStorageStatus({
          zh: `已导入 ${result.wallCount} 面墙；忽略类型：${result.skippedEntityTypes.join("、")}`,
          en: `Imported ${result.wallCount} walls; ignored types: ${result.skippedEntityTypes.join(", ")}`,
        });
      }
    } catch {
      setStorageStatus(makeStatus("dxfInvalid"));
    } finally {
      event.target.value = "";
    }
  }
  async function importBasemap(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const sourceUri = await readFileAsDataUrl(file);
      setBaseScene((current) =>
        addImportedBasemap(createSceneFromEditorDocument(current, document), {
          name: file.name,
          sourceUri,
        }),
      );
      // Nothing has looked at the pixels: the overlay can only report that.
      setAiImageOverlay(createImportedImageOverlay(file.name));
      setStorageStatus({
        zh: `底图 ${file.name}`,
        en: `Basemap ${file.name}`,
      });
    } catch {
      setStorageStatus(makeStatus("basemapInvalid"));
    } finally {
      event.target.value = "";
    }
  }
  function showTracingFixture() {
    setAiImageOverlay(createTracingFixtureOverlay(imageTracingFixtures[0].id));
  }
  function applyTemplateDraft() {
    const prompt = templatePrompt.trim();
    if (!prompt) {
      setStorageStatus(makeStatus("templatePromptRequired"));
      return;
    }
    replaceScene(
      createNaturalLanguageScenePlanDraft(prompt, currentScene).scene,
      makeStatus("templateDraftReady"),
    );
  }
  const paramActions = createSceneEditorParamActions({
    activeBasemap,
    currentScene,
    document,
    replaceScene,
    selectedBuilding,
    selectedHazard,
    selectedObstacle,
    selectedRoad,
    selectedServicePoint,
    selectedShop,
    selectedTransitStop,
    selectedZone,
    setBaseScene,
    setDocument,
  });
  return (
    <SceneEditorLayout
      aiImageOverlay={aiImageOverlay}
      templatePrompt={templatePrompt}
      basemap={activeBasemap}
      baseScene={baseScene}
      basemapInputRef={basemapInputRef}
      canLoadSavedScene={hasSavedScene}
      canRedo={redoStack.length > 0}
      canUndo={undoStack.length > 0}
      document={document}
      draftWallPoints={draftWallPoints}
      dxfInputRef={dxfInputRef}
      fileInputRef={fileInputRef}
      geoJsonInputRef={geoJsonInputRef}
      gridSize={gridSize}
      language={language}
      liveAgents={visibleLiveAgents}
      onTemplateDraft={applyTemplateDraft}
      onTemplatePromptChange={setAiPrompt}
      onApplyScene={applySceneToSimulation}
      onBasemapImport={importBasemap}
      onBasemapNumberChange={paramActions.updateBasemap}
      onBuildingKindChange={paramActions.updateBuildingKind}
      onBuildingNumberChange={paramActions.updateBuildingNumber}
      onCanvasPointerDown={handleCanvasPointerDown}
      onDeleteSelected={deleteSelected}
      onEntityPointerDown={handleEntityPointerDown}
      onExportScene={exportScene}
      onFinishWall={finishWall}
      onGeoJsonImport={importGeoJson}
      onDxfImport={importDxf}
      onGenerateZoneStores={paramActions.generateStoresForSelectedZone}
      onHazardKindChange={paramActions.updateHazardKind}
      onHazardNumberChange={paramActions.updateHazardNumber}
      onImportScene={importScene}
      onLoadSavedScene={loadSavedScene}
      onObstacleKindChange={paramActions.updateObstacleKind}
      onObstacleNumberChange={paramActions.updateObstacleNumber}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onRedo={redo}
      onResetDraftWall={() => setDraftWallPoints([])}
      onRoadDirectionChange={paramActions.updateRoadDirection}
      onRoadNumberChange={paramActions.updateRoadNumber}
      onSaveScene={saveScene}
      onSceneChange={selectExampleScene}
      onServiceNumberChange={paramActions.updateServiceNumber}
      onShowTracingFixture={showTracingFixture}
      onShopNumberChange={paramActions.updateShopNumber}
      onShopSizeChange={paramActions.updateShopSize}
      onToggleZoneWalkable={paramActions.toggleZoneWalkable}
      onToggleBasemapLocked={() => paramActions.toggleBasemap("locked")}
      onToggleBasemapVisible={() => paramActions.toggleBasemap("visible")}
      onToggleEditorViewMode={paramActions.toggleViewMode}
      onToggleObstacleBlocksMovement={paramActions.toggleObstacleBlocksMovement}
      onToggleRoadTransitOnly={() => paramActions.toggleRoadBoolean("transitOnly")}
      onToggleRoadWalkable={() => paramActions.toggleRoadBoolean("walkable")}
      onToggleSnap={() => setSnapEnabled((value) => !value)}
      onToggleTransitStopActive={paramActions.toggleTransitStopActive}
      onToolChange={switchTool}
      onTransitStopKindChange={paramActions.updateTransitStopKind}
      onTransitStopNumberChange={paramActions.updateTransitStopNumber}
      onUndo={undo}
      onZoneCategoryChange={paramActions.updateZoneCategory}
      onZoneNumberChange={paramActions.updateZoneNumber}
      selectableScenes={selectableScenes}
      selectedBuilding={selectedBuilding}
      selectedCountLine={selectedCountLine}
      selectedHazard={selectedHazard}
      selectedId={selectedId}
      selectedLabel={selectedLabel}
      selectedObstacle={selectedObstacle}
      selectedRoad={selectedRoad}
      selectedServicePoint={selectedServicePoint}
      selectedShop={selectedShop}
      selectedTransitStop={selectedTransitStop}
      selectedZone={selectedZone}
      snapEnabled={snapEnabled}
      storageStatus={storageStatus}
      svgRef={svgRef}
      t={t}
      text={text}
      tool={tool}
      tools={editorTools}
      visibleHeatmapCells={visibleHeatmapCells}
      viewMode={currentScene.visual.defaultView}
    />
  );
}
