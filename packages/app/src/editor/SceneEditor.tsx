import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import {
  parseScene,
  parseSiteContextBundle,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";
import { createNaturalLanguageScenePlanDraft } from "./aiSceneAssistant";
import { templateScenes } from "../scenes/industryTemplates";
import { imageTracingFixtures } from "./imageTracingEvaluation";
import {
  createImportedImageOverlay,
  createTracingFixtureOverlay,
  type SceneImageOverlay,
} from "./sceneEditorImageOverlay";
import { createSceneFromGeoJson } from "./geojsonImport";
import { createSceneFromDxfWithReport } from "./dxfImport";
import { createSceneFromIfcWithReport } from "./ifcImport";
import { importSiteBundle } from "../site/importSiteBundle";
import type { HeatmapCell } from "../analytics/heatmap";
import { useI18n, type LocalizedText } from "../i18n";
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
import {
  addGlbVisualAsset,
  fitsEmbeddedGlbBudget,
  modelGeometryReview,
  normalizeGlbDataUrl,
} from "./glbImport";
import type { LiveCrowd } from "../engine/liveCrowd";
type DragState = {
  before: EditorDocument;
  id: string;
  lastPoint: ScenePoint;
  moved: boolean;
};
const gridSize = 2;
const storageKey = "crowdsim.scene.v1";
// Autosave writes the working document (debounced) to its own slot, so a
// crash or an accidental tab close never costs more than the debounce
// window. It never touches the manual `storageKey` slot: overwriting what a
// user deliberately saved, with whatever they happen to have open, would be
// a data loss of its own making.
const autosaveKey = "crowdsim.autosave.v1";
const autosaveDebounceMs = 2_000;
type RecoverableAutosave = { savedAtMs: number; json: string };

/**
 * Mount-time read of the autosave slot: an autosave that differs from both
 * the initial scene and the manual slot means work that was never
 * deliberately saved — offer it for recovery exactly once, with a discard
 * that is just as easy. Anything corrupt or redundant is dropped on the spot.
 * Called from a useState initializer, so it must stay read-then-maybe-remove
 * (idempotent under StrictMode's double render).
 */
function readRecoverableAutosave(scene: CrowdSimScene): RecoverableAutosave | null {
  const stored = localStorage.getItem(autosaveKey);
  if (!stored) {
    return null;
  }
  let parsed: { savedAtMs?: unknown; scene?: unknown };
  try {
    parsed = JSON.parse(stored);
  } catch {
    localStorage.removeItem(autosaveKey);
    return null;
  }
  if (typeof parsed.scene !== "object" || parsed.scene === null) {
    localStorage.removeItem(autosaveKey);
    return null;
  }
  const autosavedJson = JSON.stringify(parsed.scene);
  if (
    autosavedJson === localStorage.getItem(storageKey) ||
    autosavedJson === JSON.stringify(scene)
  ) {
    // Already deliberately saved, or nothing actually changed: not worth a
    // recovery prompt.
    localStorage.removeItem(autosaveKey);
    return null;
  }
  return {
    savedAtMs: typeof parsed.savedAtMs === "number" ? parsed.savedAtMs : Date.now(),
    json: autosavedJson,
  };
}

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
  const siteBundleInputRef = useRef<HTMLInputElement | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
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
  /*
   * What the last site import had to say about the scene it produced —
   * inferred heights, a site with no doors. Every scene swap clears it: a
   * report about a scene that is no longer here would be a lie.
   */
  const [siteReport, setSiteReport] = useState<string[]>([]);
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
  const [recoverableAutosave, setRecoverableAutosave] =
    useState<RecoverableAutosave | null>(() => readRecoverableAutosave(scene));
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
    const withBase = scenes.some((candidate) => candidate.id === baseScene.id)
      ? scenes
      : [baseScene, ...scenes];
    // Picking a template makes `scene` that very template's scene, which is
    // also in `templateScenes` — without the dedupe the 示例场景 dropdown
    // renders the same scene (and the same React key) twice. Caught by the
    // customer-journey e2e's zero-console-errors assertion.
    return withBase.filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.id === candidate.id) === index,
    );
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
  const selectedCrosswalk = document.crosswalks.find(
    (crosswalk) => crosswalk.id === selectedId,
  );
  const selectedTrafficSignal = document.trafficSignals.find(
    (signal) => signal.id === selectedId,
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
    setSiteReport([]);
    setStorageStatus(status);
    setTool("select");
    setUndoStack([]);
  }
  function applySceneToSimulation() {
    const hasUploadedModel = currentScene.visualAssets.some(
      (asset) => asset.customParameters.uploadedByUser === true,
    );
    const review = modelGeometryReview(currentScene);
    if (hasUploadedModel && Object.values(review).some((confirmed) => !confirmed)) {
      setSiteReport([
        language === "zh"
          ? "GLB 只提供外观。请先画好墙和出入口，并在模型面板确认墙体、门和可通行区域，再应用到仿真。"
          : "A GLB only provides appearance. Draw walls and entrances, then confirm walls, doors and walkable space in the model panel before applying it.",
      ]);
      return;
    }
    // Hand the editor's working copy upward; the shell owns the live scene and
    // re-inits the simulation with it.
    onApplyScene?.(currentScene);
    setAppliedScene(currentScene);
    setLiveSceneChanged(false);
    setStorageStatus(makeStatus("sceneApplied"));
  }
  async function importGlb(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!fitsEmbeddedGlbBudget(currentScene, file.size)) {
      setStorageStatus({
        zh: "GLB 总大小不能超过 1.5 MB。请先减面并压缩纹理后再导入。",
        en: "Embedded GLBs cannot exceed 1.5 MB total. Reduce geometry and compress textures before importing.",
      });
      return;
    }

    try {
      const sourceUrl = normalizeGlbDataUrl(await readFileAsDataUrl(file));
      replaceScene(addGlbVisualAsset(currentScene, file.name, sourceUrl), {
        zh: `已导入 ${file.name}；请调整位置并完成几何确认。`,
        en: `Imported ${file.name}; adjust its placement and complete the geometry review.`,
      });
    } catch (error) {
      setStorageStatus({
        zh: `GLB 导入失败：${error instanceof Error ? error.message : "无法读取文件"}`,
        en: `GLB import failed: ${error instanceof Error ? error.message : "could not read the file"}`,
      });
    }
  }
  function updateVisualAssetNumber(
    id: string,
    field: "x" | "y" | "z" | "rotationDegrees" | "scale",
    value: number,
  ) {
    if (!Number.isFinite(value) || (field === "scale" && value <= 0)) return;
    replaceScene(
      parseScene({
        ...currentScene,
        visualAssets: currentScene.visualAssets.map((asset) =>
          asset.id !== id
            ? asset
            : field === "rotationDegrees" || field === "scale"
              ? { ...asset, [field]: value }
              : { ...asset, anchor: { ...asset.anchor, [field]: value } },
        ),
      }),
      { zh: "模型摆放已更新。", en: "Model placement updated." },
    );
  }
  function updateModelReview(
    field: "wallsConfirmed" | "entrancesConfirmed" | "walkableAreaConfirmed",
    checked: boolean,
  ) {
    const review = { ...modelGeometryReview(currentScene), [field]: checked };
    replaceScene(
      parseScene({
        ...currentScene,
        customParameters: {
          ...currentScene.customParameters,
          modelGeometryReview: review,
        },
      }),
      { zh: "模型几何确认已更新。", en: "Model geometry review updated." },
    );
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
  /**
   * Keyboard shortcuts for the 2D canvas (P2 from the 2026-10-02 review:
   * delete and undo had buttons but no keys; undo's key existed only in the
   * 3D build view). Attached to the SVG itself, so they fire only when the
   * canvas has focus — typing in a parameter input never lands here, and
   * Ctrl+Z keeps its browser meaning everywhere else.
   */
  function handleCanvasKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedId) {
        event.preventDefault();
        deleteSelected();
      }
      return;
    }
    const key = event.key.toLowerCase();
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if (withModifier && (key === "y" || (key === "z" && event.shiftKey))) {
      event.preventDefault();
      redo();
    }
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
  /*
   * Autosave: the working document, debounced, into its own slot. Best-effort
   * by design — if the slot is unwritable the loud path is the manual save's
   * quota fallback (export to file), not a second banner.
   */
  const currentSceneRef = useRef(currentScene);
  useEffect(() => {
    currentSceneRef.current = currentScene;
  }, [currentScene]);
  const didAutosaveSkipMountRef = useRef(false);
  useEffect(() => {
    // The effect also runs on mount, where writing the untouched initial
    // document would clobber a recoverable autosave before the user decides —
    // two seconds after load, refresh-recovery would be gone forever. Skip
    // the mount run: only actual edits autosave.
    if (!didAutosaveSkipMountRef.current) {
      didAutosaveSkipMountRef.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      try {
        localStorage.setItem(
          autosaveKey,
          JSON.stringify({ savedAtMs: Date.now(), scene: currentSceneRef.current }),
        );
      } catch {
        // See the comment above: best-effort by design.
      }
    }, autosaveDebounceMs);
    return () => window.clearTimeout(handle);
  }, [document]);
  function recoverAutosave() {
    if (!recoverableAutosave) {
      return;
    }
    try {
      replaceScene(
        parseScene(JSON.parse(recoverableAutosave.json)),
        makeStatus("loadedAutosave"),
      );
    } catch {
      setStorageStatus(makeStatus("savedSceneInvalid"));
    }
    localStorage.removeItem(autosaveKey);
    setRecoverableAutosave(null);
  }
  function discardAutosave() {
    localStorage.removeItem(autosaveKey);
    setRecoverableAutosave(null);
  }
  function saveScene() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(currentScene, null, 2));
      onApplyScene?.(currentScene);
      setHasSavedScene(true);
      setStorageStatus(makeStatus("savedLocally"));
    } catch {
      // Quota exceeded (a large base64 basemap embedded in the scene is the
      // usual culprit) or storage disabled. Before this, the exception was
      // uncaught and took the whole tree down with a white screen. The work
      // is too valuable to lose quietly, so fall back to the durable path —
      // a .csim.json file export — and say exactly what happened.
      downloadSceneJson(currentScene);
      setStorageStatus(makeStatus("saveFailedExported"));
    }
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
  async function importSiteBundleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const imported = importSiteBundle(
        parseSiteContextBundle(JSON.parse(await file.text())),
      );
      replaceScene(
        imported.scene,
        makeStatus("importedFile", fileNameValues(file.name)),
      );
      // Set after `replaceScene`, which clears the previous report: this one
      // is about the scene that was just put in place.
      setSiteReport(imported.report);
    } catch {
      setStorageStatus(makeStatus("siteBundleInvalid"));
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
    selectedCrosswalk,
    selectedTrafficSignal,
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
      recoverableAutosaveMs={recoverableAutosave?.savedAtMs ?? null}
      onRecoverAutosave={recoverAutosave}
      onDiscardAutosave={discardAutosave}
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
      glbInputRef={glbInputRef}
      siteBundleInputRef={siteBundleInputRef}
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
      onCrosswalkNumberChange={paramActions.updateCrosswalkNumber}
      onCrosswalkRoadIdChange={paramActions.updateCrosswalkRoadId}
      onTrafficSignalNumberChange={paramActions.updateTrafficSignalNumber}
      onTrafficSignalRoadIdChange={paramActions.updateTrafficSignalRoadId}
      onCanvasPointerDown={handleCanvasPointerDown}
      onCanvasKeyDown={handleCanvasKeyDown}
      onCountLineEndpointPointerDown={handleCountLineEndpointPointerDown}
      onDeleteSelected={deleteSelected}
      onEntityPointerDown={handleEntityPointerDown}
      onExportScene={exportScene}
      onFinishWall={finishWall}
      onGeoJsonImport={importGeoJson}
      onGlbImport={importGlb}
      onSiteBundleImport={importSiteBundleFile}
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
      onServiceNextIdChange={paramActions.updateServiceNextId}
      onServiceOutageWindowsChange={paramActions.updateServiceOutageWindows}
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
      onEntranceProfileIntervalChange={paramActions.updateEntranceProfileInterval}
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
      selectedCrosswalk={selectedCrosswalk}
      selectedTrafficSignal={selectedTrafficSignal}
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
      visualAssets={currentScene.visualAssets}
      modelReview={modelGeometryReview(currentScene)}
      onVisualAssetNumberChange={updateVisualAssetNumber}
      onModelReviewChange={updateModelReview}
      snapEnabled={snapEnabled}
      siteReport={siteReport}
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
