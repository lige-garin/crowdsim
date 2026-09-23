import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
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
import { createSceneFromIfcWithReport } from "./ifcImport";
import type { HeatmapCell } from "./heatmap";
import { useI18n, type LocalizedText } from "./i18n";
import { SceneEditorLayout } from "./SceneEditorLayout";
import { addImportedBasemap, getActiveBasemap } from "./sceneEditorBasemap";
import {
  addCountLineBetween,
  addWall,
  placeEditorTool,
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
  editorTools,
  moveCountLineEndpoint,
  moveEntity,
  removeEntity,
  snapPoint,
  type EditorDocument,
  type EditorTool,
} from "./sceneEditorState";
import { addFloor, setActiveFloor } from "./sceneEditorFloors";
import { downloadSceneJson } from "./sceneFileExport";
import { createSceneEditorParamActions } from "./SceneEditorParamActions";
import { fileNameValues, makeStatus, sceneNameValues } from "./sceneEditorStatus";
import { clamp, readFileAsDataUrl } from "./sceneEditorUtils";
import type { LiveCrowd } from "./liveCrowd";
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
  hidden = false,
  onApplyScene,
  onToolChange,
  scene,
  crowd,
  tool: controlledTool,
}: {
  heatmapCells?: readonly HeatmapCell[];
  /** Hidden while the stage shows another view; state is kept. */
  hidden?: boolean;
  /**
   * Called with the editor's working scene when the user explicitly asks to
   * apply it. Deliberately NOT called on every edit: restarting the simulation
   * for each drawn primitive would make the editor unusable.
   */
  onApplyScene?: (scene: CrowdSimScene) => void;
  /** Notified whenever the active tool changes, including internal resets. */
  onToolChange?: (tool: EditorTool) => void;
  scene: CrowdSimScene;
  /** The live crowd to draw over the plan (liveCrowd). */
  crowd?: LiveCrowd;
  /** Optional controlled tool, so a shell toolbar can drive the editor. */
  tool?: EditorTool;
}) {
  const { language, t, text } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geoJsonInputRef = useRef<HTMLInputElement | null>(null);
  const basemapInputRef = useRef<HTMLInputElement | null>(null);
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const ifcInputRef = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  /** A count line being dragged out: where it started, and where it is now. */
  const [draftCountLine, setDraftCountLine] = useState<{
    start: ScenePoint;
    end: ScenePoint;
  } | null>(null);
  /** One end of a selected count line being dragged, as { id, end, before }. */
  const endpointDrag = useRef<{
    before: EditorDocument;
    end: 0 | 1;
    id: string;
    moved: boolean;
  } | null>(null);
  const [baseScene, setBaseScene] = useState(scene);
  const [aiImageOverlay, setAiImageOverlay] = useState<SceneImageOverlay | null>(null);
  const [templatePrompt, setAiPrompt] = useState("");
  const [document, setDocument] = useState(() => createEditorDocumentFromScene(scene));
  /*
   * Keeping the editor in step with the live scene.
   *
   * The editor stays mounted while other views are shown, and the live scene
   * can change meanwhile — a building placed in 3D, an undo there. `lift`
   * records which live scene the document was taken from and the document as
   * taken. When the live scene changes:
   *  - to exactly what this editor applied: nothing to do;
   *  - while the document is untouched: take the new scene silently;
   *  - while it holds edits: keep them and warn, because "apply" would now
   *    overwrite the outside change. The user can reload the live scene.
   * Tracked in state and adjusted during render (React's pattern for deriving
   * from a changed prop), so the stale document is never rendered.
   */
  const [lift, setLift] = useState(() => ({
    document,
    from: scene as CrowdSimScene | null,
  }));
  const [seenScene, setSeenScene] = useState(scene);
  const [appliedScene, setAppliedScene] = useState<CrowdSimScene | null>(null);
  const [liveSceneChanged, setLiveSceneChanged] = useState(false);
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
  if (scene !== seenScene) {
    setSeenScene(scene);
    if (scene === appliedScene) {
      setLift({ document, from: scene });
      setLiveSceneChanged(false);
    } else if (
      lift.from !== null &&
      document === lift.document &&
      draftWallPoints.length === 0
    ) {
      takeLiveScene();
    } else {
      setLiveSceneChanged(true);
    }
  }
  /** Replace the working document with the live scene, forgetting its history. */
  function takeLiveScene() {
    const lifted = createEditorDocumentFromScene(scene);
    setBaseScene(scene);
    setDocument(lifted);
    setLift({ document: lifted, from: scene });
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  }
  function reloadLiveScene() {
    takeLiveScene();
    setLiveSceneChanged(false);
    setAiImageOverlay(null);
    setDraftWallPoints([]);
    setParamEditTarget(null);
  }
  // The entity a run of parameter edits belongs to; consecutive edits of the
  // same entity collapse into one undo step (typing "120" is one change, not
  // three). Any other document change ends the run.
  const [paramEditTarget, setParamEditTarget] = useState<string | null>(null);
  function editParameters(update: SetStateAction<EditorDocument>) {
    const next = typeof update === "function" ? update(document) : update;
    if (next === document) {
      return;
    }
    if (paramEditTarget !== (selectedId ?? "")) {
      setUndoStack((stack) => [...stack, document]);
      setParamEditTarget(selectedId ?? "");
    }
    setRedoStack([]);
    setDocument(next);
  }
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
  const visibleCrowd = baseScene.id === scene.id ? crowd : undefined;
  const selectedShop = document.shops.find((shop) => shop.id === selectedId);
  const selectedRoad = document.roads.find((road) => road.id === selectedId);
  const selectedBuilding = document.buildings.find(
    (building) => building.id === selectedId,
  );
  const selectedEntrance = document.entrances.find(
    (entrance) => entrance.id === selectedId,
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
  const selectedConnector = document.connectors.find(
    (connector) => connector.id === selectedId,
  );
  function replaceScene(nextScene: CrowdSimScene, status: LocalizedText) {
    const replaced = createEditorDocumentFromScene(nextScene);
    setBaseScene(nextScene);
    setDocument(replaced);
    // Not lifted from the live scene: a later outside change must not replace it.
    setLift({ document: replaced, from: null });
    setParamEditTarget(null);
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
    setAppliedScene(currentScene);
    setLiveSceneChanged(false);
    setStorageStatus(makeStatus("sceneApplied"));
  }
  function switchTool(nextTool: EditorTool) {
    setTool(nextTool);
    setDraftWallPoints([]);
  }
  function commit(nextDocument: EditorDocument) {
    setParamEditTarget(null);
    setUndoStack((stack) => [...stack, document]);
    setRedoStack([]);
    setDocument(nextDocument);
  }
  function addFloorAbove() {
    commit(addFloor(document));
    setSelectedId(null);
    setDraftWallPoints([]);
  }
  function selectFloor(floorId: string) {
    const next = setActiveFloor(document, floorId);
    if (next === document) {
      return;
    }
    setDocument(next);
    setSelectedId(null);
    setDraftWallPoints([]);
  }
  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) {
      return;
    }
    setParamEditTarget(null);
    setRedoStack((stack) => [...stack, document]);
    setUndoStack((stack) => stack.slice(0, -1));
    setDocument({ ...previous, activeFloorId: document.activeFloorId });
    setSelectedId(null);
    setDraftWallPoints([]);
  }
  function redo() {
    const next = redoStack.at(-1);
    if (!next) {
      return;
    }
    setParamEditTarget(null);
    setUndoStack((stack) => [...stack, document]);
    setRedoStack((stack) => stack.slice(0, -1));
    setDocument({ ...next, activeFloorId: document.activeFloorId });
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
    if (tool === "countLine") {
      // Dragged out like a wall is drawn point to point, so the line can cross
      // the flow at any angle instead of always lying east-west.
      setDraftCountLine({ end: point, start: point });
      return;
    }
    const placed = placeEditorTool(document, tool, point);
    if (placed) {
      commit(placed);
    }
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
    const nextPoint = pointFromEvent(event);
    if (draftCountLine) {
      setDraftCountLine((draft) => (draft ? { ...draft, end: nextPoint } : draft));
      return;
    }
    const endpoint = endpointDrag.current;
    if (endpoint) {
      endpoint.moved = true;
      setDocument((current) =>
        moveCountLineEndpoint(current, endpoint.id, endpoint.end, nextPoint),
      );
      return;
    }
    const drag = dragState.current;
    if (!drag) {
      return;
    }
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
  function handleCountLineEndpointPointerDown(
    event: ReactPointerEvent<SVGElement>,
    id: string,
    end: 0 | 1,
  ) {
    if (tool !== "select") {
      return;
    }
    event.stopPropagation();
    setSelectedId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    endpointDrag.current = { before: document, end, id, moved: false };
  }
  function handlePointerUp() {
    const draft = draftCountLine;
    if (draft) {
      setDraftCountLine(null);
      const length = Math.hypot(
        draft.end.x - draft.start.x,
        draft.end.y - draft.start.y,
      );
      // Released without a drag, fall back to the fixed line a single click
      // drops in the 3D world, so the tool never leaves someone with nothing.
      const placed =
        length < 1
          ? placeEditorTool(document, "countLine", draft.start)
          : addCountLineBetween(document, draft.start, draft.end);
      if (placed) {
        commit(placed);
        setSelectedId(`count-line-${document.nextId}`);
        setTool("select");
      }
      return;
    }
    const endpoint = endpointDrag.current;
    if (endpoint) {
      if (endpoint.moved) {
        setParamEditTarget(null);
        setUndoStack((stack) => [...stack, endpoint.before]);
        setRedoStack([]);
      }
      endpointDrag.current = null;
      return;
    }
    const drag = dragState.current;
    if (!drag) {
      return;
    }
    if (drag.moved) {
      setParamEditTarget(null);
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
  async function importIfc(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const wasmUrl = (await import("web-ifc/web-ifc.wasm?url")).default;
      const result = await createSceneFromIfcWithReport(
        currentScene,
        new Uint8Array(await file.arrayBuffer()),
        { wasmUrl },
      );

      if (result.wallCount === 0) {
        setStorageStatus(makeStatus("ifcInvalid"));
        return;
      }

      replaceScene(
        result.scene,
        makeStatus("ifcImportedWalls", {
          en: { count: result.wallCount },
          zh: { count: result.wallCount },
        }),
      );

      // Doors, windows, spaces and every other IFC entity type this
      // importer does not read geometry for are reported rather than
      // dropped silently, the same as DXF's ignored entity types above.
      if (result.hadUnconvertedEntities) {
        setStorageStatus({
          zh: `已导入 ${result.wallCount} 面墙；文件中的门/窗/空间等其他构件未导入`,
          en: `Imported ${result.wallCount} walls; doors/windows/spaces and other elements in the file were not imported`,
        });
      }
    } catch {
      setStorageStatus(makeStatus("ifcInvalid"));
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
    selectedConnector,
    selectedCountLine,
    selectedHazard,
    selectedObstacle,
    selectedRoad,
    selectedServicePoint,
    selectedShop,
    selectedEntrance,
    selectedTransitStop,
    selectedZone,
    setBaseScene,
    // Parameter edits are real edits: undoable, one step per entity.
    setDocument: editParameters,
  });
  return (
    <SceneEditorLayout
      hidden={hidden}
      onReloadLiveScene={liveSceneChanged ? reloadLiveScene : undefined}
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
      draftCountLine={draftCountLine}
      dxfInputRef={dxfInputRef}
      ifcInputRef={ifcInputRef}
      fileInputRef={fileInputRef}
      geoJsonInputRef={geoJsonInputRef}
      gridSize={gridSize}
      language={language}
      crowd={visibleCrowd}
      onTemplateDraft={applyTemplateDraft}
      onTemplatePromptChange={setAiPrompt}
      onAddFloor={addFloorAbove}
      onApplyScene={applySceneToSimulation}
      onBasemapImport={importBasemap}
      onBasemapNumberChange={paramActions.updateBasemap}
      onBuildingKindChange={paramActions.updateBuildingKind}
      onBuildingNumberChange={paramActions.updateBuildingNumber}
      onConnectorCapacityChange={paramActions.updateConnectorCapacity}
      onConnectorCarCountChange={paramActions.updateConnectorCarCount}
      onConnectorDoorSecondsChange={paramActions.updateConnectorDoorSeconds}
      onConnectorKindChange={paramActions.updateConnectorKind}
      onConnectorWidthChange={paramActions.updateConnectorWidth}
      onToggleConnectorBidirectional={paramActions.toggleConnectorBidirectional}
      onCountLineNameChange={paramActions.updateCountLineName}
      onCanvasPointerDown={handleCanvasPointerDown}
      onCountLineEndpointPointerDown={handleCountLineEndpointPointerDown}
      onDeleteSelected={deleteSelected}
      onEntityPointerDown={handleEntityPointerDown}
      onExportScene={exportScene}
      onFinishWall={finishWall}
      onGeoJsonImport={importGeoJson}
      onDxfImport={importDxf}
      onIfcImport={importIfc}
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
      onSelectFloor={selectFloor}
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
      onToggleRoadVehicleAccessible={() =>
        paramActions.toggleRoadBoolean("vehicleAccessible")
      }
      onToggleRoadWalkable={() => paramActions.toggleRoadBoolean("walkable")}
      onToggleSnap={() => setSnapEnabled((value) => !value)}
      onToggleTransitStopActive={paramActions.toggleTransitStopActive}
      onToolChange={switchTool}
      onEntranceKindChange={paramActions.updateEntranceKind}
      onEntrancePopulationChange={paramActions.updateEntrancePopulation}
      onEntranceProfileChange={paramActions.updateEntranceProfile}
      onEntranceNumberChange={paramActions.updateEntranceNumber}
      onTransitStopKindChange={paramActions.updateTransitStopKind}
      onTransitStopNumberChange={paramActions.updateTransitStopNumber}
      onUndo={undo}
      onZoneCategoryChange={paramActions.updateZoneCategory}
      onZoneNumberChange={paramActions.updateZoneNumber}
      selectableScenes={selectableScenes}
      selectedBuilding={selectedBuilding}
      selectedConnector={selectedConnector}
      selectedCountLine={selectedCountLine}
      selectedEntrance={selectedEntrance}
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
