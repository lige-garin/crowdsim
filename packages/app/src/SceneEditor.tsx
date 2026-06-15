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
import { createLocalSceneAssistantDraft } from "./aiSceneAssistant";
import { calibrateImageScale } from "./aiImageGeometry";
import { templateScenes } from "./industryTemplates";
import { imageTracingFixtures } from "./imageTracingEvaluation";
import { createSceneFromGeoJson } from "./geojsonImport";
import type { HeatmapCell } from "./heatmap";
import { useI18n, type LocalizedText } from "./i18n";
import { SceneEditorLayout } from "./SceneEditorLayout";
import {
  addImportedBasemap,
  getActiveBasemap,
  toggleBasemapBoolean,
  updateBasemapNumber,
  type BasemapNumberField,
} from "./sceneEditorBasemap";
import {
  addCountLine,
  addEntrance,
  addServicePoint,
  addShop,
  addTarget,
  addWall,
  addZone,
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
  moveEntity,
  removeEntity,
  snapPoint,
  type EditorDocument,
  type EditorTool,
  type EditorZoneCategory,
} from "./sceneEditorState";
import { downloadSceneJson } from "./sceneFileExport";
import {
  toggleDocumentZoneWalkable,
  updateDocumentServiceNumber,
  updateDocumentShopNumber,
  updateDocumentShopSize,
  updateDocumentZoneCategory,
  updateDocumentZoneNumber,
  type ServiceNumberField,
  type ShopNumberField,
  type ShopSizeField,
  type ZoneNumberField,
} from "./sceneEditorMutations";
import { fileNameValues, makeStatus, sceneNameValues } from "./sceneEditorStatus";
import { clamp, readFileAsDataUrl } from "./sceneEditorUtils";
import { toggleEditorViewMode } from "./sceneEditorViewMode";
import type { SimulationSnapshot } from "./simulationEngine";
import { generateStoreLotsForZone } from "./storeLotGeneration";

type DragState = {
  before: EditorDocument;
  id: string;
  lastPoint: ScenePoint;
  moved: boolean;
};

const gridSize = 2;
const storageKey = "crowdsim.scene.v1";
const editorTools: readonly EditorTool[] = [
  "select",
  "zone",
  "wall",
  "source",
  "sink",
  "target",
  "shop",
  "counter",
  "gate",
  "countLine",
];

export function SceneEditor({
  heatmapCells = [],
  scene,
  simulationSnapshot,
}: {
  heatmapCells?: readonly HeatmapCell[];
  scene: CrowdSimScene;
  simulationSnapshot?: SimulationSnapshot;
}) {
  const { language, t, text } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geoJsonInputRef = useRef<HTMLInputElement | null>(null);
  const basemapInputRef = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [baseScene, setBaseScene] = useState(scene);
  const [aiImageOverlayVisible, setAiImageOverlayVisible] = useState(false);
  const [document, setDocument] = useState(() => createEditorDocumentFromScene(scene));
  const [draftWallPoints, setDraftWallPoints] = useState<ScenePoint[]>([]);
  const [redoStack, setRedoStack] = useState<EditorDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [storageStatus, setStorageStatus] = useState<LocalizedText>(() =>
    makeStatus("ready"),
  );
  const [tool, setTool] = useState<EditorTool>("select");
  const [undoStack, setUndoStack] = useState<EditorDocument[]>([]);
  const [hasSavedScene, setHasSavedScene] = useState(() =>
    typeof localStorage === "undefined"
      ? false
      : localStorage.getItem(storageKey) !== null,
  );

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
  const aiImageOverlay = useMemo(() => {
    if (!aiImageOverlayVisible) {
      return null;
    }

    const fixture = imageTracingFixtures[0];

    return {
      calibration: calibrateImageScale({
        knownDistanceMeters: fixture.knownDistanceMeters,
        pixelA: { x: 0, y: 0 },
        pixelB: { x: fixture.pixelDistance, y: 0 },
      }),
      draft: fixture.draft,
    };
  }, [aiImageOverlayVisible]);
  const selectedShop = document.shops.find((shop) => shop.id === selectedId);
  const selectedZone = document.zones.find((zone) => zone.id === selectedId);
  const selectedServicePoint = document.servicePoints.find(
    (point) => point.id === selectedId,
  );
  const selectedCountLine = document.countLines.find((line) => line.id === selectedId);

  function replaceScene(nextScene: CrowdSimScene, status: LocalizedText) {
    setBaseScene(nextScene);
    setDocument(createEditorDocumentFromScene(nextScene));
    setDraftWallPoints([]);
    setRedoStack([]);
    setSelectedId(null);
    setStorageStatus(status);
    setTool("select");
    setUndoStack([]);
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

    if (tool === "source" || tool === "sink") {
      commit(addEntrance(document, tool, point));
      return;
    }

    if (tool === "shop") {
      commit(addShop(document, point));
      return;
    }

    if (tool === "counter" || tool === "gate") {
      commit(addServicePoint(document, tool, point));
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
      setAiImageOverlayVisible(true);
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

  function applyAiDraft() {
    setAiImageOverlayVisible(true);
    replaceScene(
      createLocalSceneAssistantDraft(
        "mall circulation with two attractive shops, one gate service point, and one count line",
        currentScene,
      ),
      makeStatus("aiDraftReady"),
    );
  }

  function updateShopNumber(field: ShopNumberField, value: number) {
    if (!selectedShop || !Number.isFinite(value)) return;
    setDocument((current) =>
      updateDocumentShopNumber(current, selectedShop.id, field, value),
    );
  }

  function updateShopSize(field: ShopSizeField, value: number) {
    if (!selectedShop || !Number.isFinite(value)) return;
    setDocument((current) =>
      updateDocumentShopSize(current, selectedShop.id, field, value),
    );
  }

  function updateServiceNumber(field: ServiceNumberField, value: number) {
    if (!selectedServicePoint || !Number.isFinite(value)) return;
    setDocument((current) =>
      updateDocumentServiceNumber(current, selectedServicePoint.id, field, value),
    );
  }

  function updateZoneNumber(field: ZoneNumberField, value: number) {
    if (!selectedZone || !Number.isFinite(value)) return;
    setDocument((current) =>
      updateDocumentZoneNumber(current, selectedZone.id, field, value),
    );
  }

  function updateZoneCategory(category: EditorZoneCategory) {
    if (selectedZone)
      setDocument((current) =>
        updateDocumentZoneCategory(current, selectedZone.id, category),
      );
  }
  function toggleZoneWalkable() {
    if (selectedZone)
      setDocument((current) => toggleDocumentZoneWalkable(current, selectedZone.id));
  }
  function generateStoresForSelectedZone() {
    if (!selectedZone) return;
    const generated = generateStoreLotsForZone(currentScene, selectedZone.id);
    const count = generated.summary.shopIds.length;
    replaceScene(generated.scene, {
      zh: `已生成 ${count} 个店铺`,
      en: `Generated ${count} stores`,
    });
  }
  function updateBasemap(field: BasemapNumberField, value: number) {
    if (!activeBasemap || !Number.isFinite(value)) return;
    setBaseScene((current) =>
      updateBasemapNumber(current, activeBasemap.id, field, value),
    );
  }
  function toggleBasemap(field: "locked" | "visible") {
    if (!activeBasemap) return;
    setBaseScene((current) => toggleBasemapBoolean(current, activeBasemap.id, field));
  }
  function toggleViewMode() {
    setBaseScene((current) =>
      toggleEditorViewMode(createSceneFromEditorDocument(current, document)),
    );
  }

  return (
    <SceneEditorLayout
      aiImageOverlay={aiImageOverlay}
      basemap={activeBasemap}
      baseScene={baseScene}
      basemapInputRef={basemapInputRef}
      canLoadSavedScene={hasSavedScene}
      canRedo={redoStack.length > 0}
      canUndo={undoStack.length > 0}
      document={document}
      draftWallPoints={draftWallPoints}
      fileInputRef={fileInputRef}
      geoJsonInputRef={geoJsonInputRef}
      gridSize={gridSize}
      language={language}
      liveAgents={visibleLiveAgents}
      onAiDraft={applyAiDraft}
      onBasemapImport={importBasemap}
      onBasemapNumberChange={updateBasemap}
      onCanvasPointerDown={handleCanvasPointerDown}
      onDeleteSelected={deleteSelected}
      onEntityPointerDown={handleEntityPointerDown}
      onExportScene={exportScene}
      onFinishWall={finishWall}
      onGeoJsonImport={importGeoJson}
      onGenerateZoneStores={generateStoresForSelectedZone}
      onImportScene={importScene}
      onLoadSavedScene={loadSavedScene}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onRedo={redo}
      onResetDraftWall={() => setDraftWallPoints([])}
      onSaveScene={saveScene}
      onSceneChange={selectExampleScene}
      onServiceNumberChange={updateServiceNumber}
      onShopNumberChange={updateShopNumber}
      onShopSizeChange={updateShopSize}
      onToggleZoneWalkable={toggleZoneWalkable}
      onToggleBasemapLocked={() => toggleBasemap("locked")}
      onToggleBasemapVisible={() => toggleBasemap("visible")}
      onToggleEditorViewMode={toggleViewMode}
      onToggleSnap={() => setSnapEnabled((value) => !value)}
      onToolChange={switchTool}
      onUndo={undo}
      onZoneCategoryChange={updateZoneCategory}
      onZoneNumberChange={updateZoneNumber}
      selectableScenes={selectableScenes}
      selectedCountLine={selectedCountLine}
      selectedId={selectedId}
      selectedLabel={selectedLabel}
      selectedServicePoint={selectedServicePoint}
      selectedShop={selectedShop}
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
