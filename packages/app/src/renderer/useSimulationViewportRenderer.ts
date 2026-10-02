import { useEffect, useRef, useState } from "react";
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
} from "three";
import type { WebGLRenderer } from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { viewportAgentCapacity } from "../viewport/renderBenchmark";
import {
  agentWorldPosition,
  selectCrowdAgents,
  type ViewedFloor,
  visibleAgentCount,
} from "../viewport/agentInstanceField";
import { crowdBudget } from "../engine/crowdBudget";
import { createCrowdFigures, type CrowdFigureAgent } from "./crowdFigures";
import { createSkeletalCharacters } from "./skeletalCharacters";
import { screenToNdc } from "../viewport/agentPicking";
import { sceneHeadingToRenderRotationZ } from "./sceneHeading";
import {
  attachCityCameraControls,
  initialCityCameraRig,
  type CityCameraRig,
} from "./cityCameraControls";
import { createCityObjects, type CityObjects } from "./cityMeshes";
import { CITY_CAMERA_FOV_DEGREES } from "../viewport/orbitCamera";
import { toRenderX, toRenderY } from "../viewport/simulationViewportGeometry";
import { attachPlacementGhost } from "./placementGhost";
import { attachCountLineDraft } from "./countLineDragTool";
import { scenePointAtScreen } from "./worldPlacement";
import type { EditorTool } from "../editor/sceneEditorState";
import type { SimulationSnapshot } from "../engine/simulationEngine";
import type { ViewportAgentOverlayFrame } from "../viewport/simulationViewportOverlay";
import { createSceneRenderPlan } from "../viewport/sceneRenderPlan";
import { createViewportOverlayPlan } from "../viewport/viewportOverlayPlan";
import { loadSceneVisualAssetObject } from "./sceneModelAssets";
import type { ViewportLayers } from "../viewport/viewportLayers";
import type { HeatmapCell } from "../analytics/heatmap";
import type { RenderStatus, ViewMode } from "../viewport/simulationViewportTypes";
import type { ViewportRenderMode } from "../viewport/viewportRenderMode";
import { localizedStatus, rawStatus } from "../viewport/simulationViewportStatus";
import { applyViewportLayers } from "./simulationViewportLayerVisibility";
import {
  applySceneAtmosphere,
  sceneAtmosphere,
  cityNightLevel,
  createDynamicRenderObjects,
  createStaticRenderObjects,
  createDayNightRig,
  createFloor,
  createWall,
  disposeRenderObject,
} from "./simulationViewportSceneObjects";
import {
  benchmarkViewportRenderer,
  createFallbackViewportRenderer,
  createGpuViewportRenderer,
} from "./simulationViewportRendererFactory";
import { createViewportPostProcessing } from "./viewportPostProcessing";
/**
 * Vehicle boxes are a fixed, small pool — the project's own vehicle model has
 * no road network (ADR-0016 stage 1: a car only ever traverses the single
 * road it spawned on), so a scene's total vehicle count is bounded by its
 * arrival rates, not its agent budget. Tens, not thousands; see ADR-0020.
 */
const vehicleViewportCapacity = 64;
/**
 * Compat-mode (software WebGL) frame cap, ADR-0006's "scale-limited
 * compatibility mode": rendering at the display's full rate on a software
 * renderer measurably saturates the main thread and starves pointer
 * handling. ~24 fps keeps the preview live while leaving the thread usable.
 */
const COMPAT_FRAME_INTERVAL_MS = 1_000 / 24;
type RendererArgs = {
  crowdScene?: CrowdSimScene;
  /** The floor being watched; its crowd is the only one drawn (ADR-0010). */
  floor?: ViewedFloor;
  heatmapCells: readonly HeatmapCell[];
  layers: ViewportLayers;
  onPlace?: (tool: EditorTool, point: ScenePoint) => void;
  /** A count line dragged out between two points (ADR-0031). */
  onPlaceLine?: (start: ScenePoint, end: ScenePoint) => void;
  placementTool?: EditorTool;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode: ViewMode;
};
export function useSimulationViewportRenderer({
  crowdScene,
  floor,
  heatmapCells,
  layers,
  onPlace,
  onPlaceLine,
  placementTool,
  sharedAgentOverlay,
  snapshot,
  viewMode,
}: RendererArgs) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  // Read through refs so picking a tool or a new callback never rebuilds the scene.
  const placementToolRef = useRef(placementTool);
  const onPlaceRef = useRef(onPlace);
  const onPlaceLineRef = useRef(onPlaceLine);
  const placementRef = useRef<ReturnType<typeof attachPlacementGhost> | null>(null);
  useEffect(() => {
    placementToolRef.current = placementTool;
    onPlaceRef.current = onPlace;
    onPlaceLineRef.current = onPlaceLine;
    // Dropping the tool (Escape) must clear the ghost now, not on the next
    // mouse move — a click in between would pick an agent under a ghost that
    // still promised a placement.
    placementRef.current?.refresh();
  }, [placementTool, onPlace, onPlaceLine]);
  const sharedOverlayRef = useRef(sharedAgentOverlay);
  useEffect(() => {
    sharedOverlayRef.current = sharedAgentOverlay;
  }, [sharedAgentOverlay]);
  const floorRef = useRef(floor);
  useEffect(() => {
    floorRef.current = floor;
  }, [floor]);
  const crowdSceneRef = useRef(crowdScene);
  useEffect(() => {
    crowdSceneRef.current = crowdScene;
  }, [crowdScene]);
  const hasScene = crowdScene !== undefined;
  const worldWidth = crowdScene?.world.width ?? 80;
  const worldHeight = crowdScene?.world.height ?? 48;
  // Camera rig outlives renderer rebuilds, so a scene edit keeps your view --
  // the initial value is sized to the FIRST scene this hook mounts with,
  // since a template pick from the homepage remounts this hook fresh
  // (App.tsx unmounts AppWorkbench while home is showing).
  const rigRef = useRef<CityCameraRig>(
    initialCityCameraRig({ height: worldHeight, width: worldWidth }),
  );
  const cityRef = useRef<CityObjects | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const dynamicGroupRef = useRef<Group | null>(null);
  const crowdMeshRef = useRef<Object3D | null>(null);
  const lightRigRef = useRef<ReturnType<typeof createDayNightRig> | null>(null);
  const layersRef = useRef(layers);
  const [status, setStatus] = useState<RenderStatus>(() => localizedStatus("starting"));
  const [renderMode, setRenderMode] = useState<ViewportRenderMode>("detecting");
  const [fps, setFps] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const sceneVisualSecond = Math.floor((snapshot?.elapsedSeconds ?? 0) / 5) * 5;
  /*
   * Renderer layer: GPU device, renderer, camera, crowd instances, controls,
   * lights and the render loop. Keyed on the view mode and the world's size.
   *
   * It used to be keyed on the scene object, so every scene edit — and with
   * in-world building, every click — destroyed the GPU device, requested a new
   * adapter, re-ran the blocking benchmark and regenerated the city, while the
   * simulation underneath (ADR-0007) carried straight on. Scene geometry now
   * lives in the scene layer below and is swapped without touching the device.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const canvasElement = canvas;
    let disposed = false;
    let animationFrameId = 0;
    let watchdogTimerId = 0;
    let resizeObserver: ResizeObserver | undefined;
    let renderer: WebGLRenderer | WebGPURenderer | undefined;
    let gpuDevice: GPUDevice | undefined;
    let postProcessing: ReturnType<typeof createViewportPostProcessing> | undefined;
    let renderHalted = false;
    // 0 = render every animation frame (the full-GPU path); the compat
    // branches raise this to cap software-WebGL rendering at ~24 fps.
    let frameIntervalMs = 0;
    let lastRenderAtMs = 0;
    const scene = new Scene();
    const camera =
      viewMode === "3d"
        ? new PerspectiveCamera(CITY_CAMERA_FOV_DEGREES, 16 / 10, 0.5, 2600)
        : new OrthographicCamera(-26, 26, 17, -17, 0.1, 100);
    const dummy = new Object3D();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let lastFrameAt = lastFpsUpdate;
    // 3D draws people (heads, limbs, five builds); 2D keeps flat top-down dots.
    const figures =
      viewMode === "3d" ? createCrowdFigures(crowdBudget.maxAgents) : undefined;
    // Close-up realism for whoever the camera is nearest to, on top of
    // `figures` rather than instead of it — see skeletalCharacters.ts for
    // why this stays a small bounded layer, not a crowd-wide swap.
    const skeletalCharacters = figures ? createSkeletalCharacters() : undefined;
    // 2D draws each person as a flat square dot. Mutually exclusive with
    // `figures` by construction (exactly one of the two is ever defined for
    // a given render) -- every `figures!`/`agents!` non-null assertion
    // below this point relies on that.
    const agents = figures
      ? undefined
      : new InstancedMesh(
          new PlaneGeometry(1, 1),
          new MeshBasicMaterial({ color: "#2f6f63" }),
          viewportAgentCapacity,
        );
    if (agents) agents.frustumCulled = false;
    // A road-going vehicle is not a pedestrian: its own small InstancedMesh,
    // not folded into `figures`/`agents` above. Faces its direction of
    // travel (`updateVehicleInstances`, `vehicleSimulation.headingRadians`)
    // — this is still a box, not a vehicle model (ADR-0020).
    const vehicles = new InstancedMesh(
      new BoxGeometry(4, 1.8, 1.5),
      new MeshBasicMaterial({ color: "#3b4a5a" }),
      vehicleViewportCapacity,
    );
    vehicles.frustumCulled = false;
    const dynamicGroup = new Group();
    dynamicGroup.name = "scene-dynamic";
    const lightRig =
      viewMode === "3d" && hasScene
        ? createDayNightRig({ height: worldHeight, width: worldWidth })
        : undefined;
    const raycaster = new Raycaster();
    // Clicks only pick people in 3D, where the figures are drawn.
    function pickAgentAt(clientX: number, clientY: number) {
      const rect = canvasElement.getBoundingClientRect();
      const ndc = screenToNdc(clientX, clientY, rect);
      raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
      setSelectedAgentId(figures!.pick(raycaster));
    }
    let detachCameraControls: (() => void) | undefined;
    let placement: ReturnType<typeof attachPlacementGhost> | undefined;
    let countLineDraft: ReturnType<typeof attachCountLineDraft> | undefined;
    if (viewMode === "3d") {
      placement = hasScene
        ? attachPlacementGhost({
            camera,
            canvas: canvasElement,
            getScene: () => crowdSceneRef.current,
            getTool: () => placementToolRef.current,
            onPlace: (tool, point) => onPlaceRef.current?.(tool, point),
            parent: scene,
          })
        : undefined;
      countLineDraft = attachCountLineDraft(scene);
      camera.up.set(0, 0, 1);
      // A count-line drag's own start point, live only between the tool's
      // onDown and onUp (ADR-0031) — not a ref, since nothing outside this
      // effect's closure ever needs it.
      let dragStart: ScenePoint | null = null;
      const pointAt = (clientX: number, clientY: number) => {
        const activeScene = crowdSceneRef.current;
        return activeScene
          ? scenePointAtScreen(
              camera,
              canvasElement.getBoundingClientRect(),
              clientX,
              clientY,
              activeScene.world,
            )
          : null;
      };
      detachCameraControls = attachCityCameraControls({
        camera: camera as PerspectiveCamera,
        canvas: canvasElement,
        limit: {
          maxX: worldWidth / 2 + 150,
          maxY: worldHeight / 2 + 150,
          minX: -worldWidth / 2 - 150,
          minY: -worldHeight / 2 - 150,
        },
        onClick: (clientX, clientY) => {
          if (!placement?.handleClick(clientX, clientY)) pickAgentAt(clientX, clientY);
        },
        rig: rigRef.current,
        tool: {
          isActive: () => placementToolRef.current === "countLine",
          onDown: (clientX, clientY) => {
            const point = pointAt(clientX, clientY);
            if (!point) return;
            dragStart = point;
            const activeScene = crowdSceneRef.current;
            if (activeScene) countLineDraft?.show(point, point, activeScene.world);
          },
          onMove: (clientX, clientY) => {
            if (!dragStart) return;
            const point = pointAt(clientX, clientY);
            const activeScene = crowdSceneRef.current;
            if (point && activeScene) {
              countLineDraft?.show(dragStart, point, activeScene.world);
            }
          },
          onUp: (clientX, clientY) => {
            countLineDraft?.hide();
            const start = dragStart;
            dragStart = null;
            if (!start) return;
            const end = pointAt(clientX, clientY) ?? start;
            const draggedMeters = Math.hypot(end.x - start.x, end.y - start.y);
            // Shorter than a real drag: fall back to the fixed-segment
            // single-point tool "so the tool never leaves someone with
            // nothing" — the same threshold and the same phrase the 2D
            // editor's own fallback already uses (SceneEditor.tsx).
            if (draggedMeters < 1) {
              onPlaceRef.current?.("countLine", start);
            } else {
              onPlaceLineRef.current?.(start, end);
            }
          },
        },
      });
      placementRef.current = placement ?? null;
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, 40);
      camera.lookAt(0, 0, 0);
    }
    scene.background = new Color("#f6f9fc");
    agents?.instanceMatrix.setUsage(DynamicDrawUsage);
    vehicles.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(figures?.group ?? agents!);
    // A child of `figures.group`, not the scene, so the "crowd" layer
    // toggle (`applyViewportLayers`, keyed off `crowdMeshRef`) hides both
    // layers together instead of only the procedural one.
    if (skeletalCharacters) figures!.group.add(skeletalCharacters.group);
    scene.add(vehicles);
    scene.add(dynamicGroup);
    lightRig?.attach(scene);
    function resize() {
      const parent = canvasElement.parentElement;
      if (!parent) {
        return;
      }
      const { width, height } = parent.getBoundingClientRect();
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      const aspect = safeWidth / safeHeight;
      if (camera instanceof OrthographicCamera) {
        const verticalExtent = worldHeight * 0.62;
        camera.left = -verticalExtent * aspect;
        camera.right = verticalExtent * aspect;
        camera.top = verticalExtent;
        camera.bottom = -verticalExtent;
      } else {
        camera.aspect = aspect;
      }
      camera.updateProjectionMatrix();
      renderer?.setSize(safeWidth, safeHeight, false);
    }
    function observeResize() {
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvasElement.parentElement ?? canvasElement);
    }
    let renderedAgentCount = 0;
    let renderedVehicleCount = 0;
    /** Parks every instance off-screen and zeroes the drawn count — shared by
     * `seedAgents`/`seedVehicles` below, which differ only in which mesh and
     * capacity they seed. */
    function seedMesh(mesh: InstancedMesh, capacity: number) {
      for (let index = 0; index < capacity; index++) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, 0, -1000);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    function seedAgents() {
      if (agents) seedMesh(agents, viewportAgentCapacity);
    }
    function seedVehicles() {
      seedMesh(vehicles, vehicleViewportCapacity);
    }
    /** Clears instances past `visible` and commits the mesh's drawn count —
     * shared by `updateAgentInstances`'s 2D compat path and
     * `updateVehicleInstances`, which differ only in how they compute each
     * live entity's world position, not in how they commit to the mesh. */
    function commitInstances(mesh: InstancedMesh, visible: number, rendered: number) {
      for (let index = visible; index < rendered; index++) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      const touched = Math.max(visible, rendered);
      mesh.count = visible;
      if (touched > 0) {
        mesh.instanceMatrix.addUpdateRange(0, touched * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
      return visible;
    }
    function updateAgentInstances(deltaSeconds: number) {
      const live = selectCrowdAgents(
        snapshotRef.current?.agents,
        sharedOverlayRef.current?.agents,
        floorRef.current,
      );
      if (figures) {
        const hidden = skeletalCharacters?.update(
          live as readonly CrowdFigureAgent[],
          { height: worldHeight, width: worldWidth },
          { camera: camera.position, deltaSeconds },
        );
        figures.update(
          live as readonly CrowdFigureAgent[],
          { height: worldHeight, width: worldWidth },
          crowdSceneRef.current?.seed ?? 1,
          {
            camera: camera.position,
            colourByBehaviour: layersRef.current.behaviour,
            hidden,
          },
        );
        return;
      }
      if (!agents) return;
      const visible = visibleAgentCount(live.length, viewportAgentCapacity);
      for (let index = 0; index < visible; index++) {
        const world = agentWorldPosition(
          live[index],
          { width: worldWidth, height: worldHeight },
          viewMode,
        );
        dummy.position.set(world.x, world.y, world.z);
        // `dummy` is shared with `updateVehicleInstances` below, which does
        // set a rotation — reset it here rather than assume it's still the
        // zero identity, or a pedestrian drawn after a vehicle would inherit
        // that vehicle's own facing.
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        agents.setMatrixAt(index, dummy.matrix);
      }
      renderedAgentCount = commitInstances(agents, visible, renderedAgentCount);
    }
    /** A vehicle's own small InstancedMesh (ADR-0020) — same technique as
     * `updateAgentInstances`'s 2D compat path, no shared-memory overlay since
     * a scene's vehicle count is tens, not thousands (see B in its own
     * reconnaissance). Floor-filtered the same way `selectCrowdAgents` filters
     * pedestrians, by id (the snapshot carries no floor index for vehicles). */
    function updateVehicleInstances() {
      const floor = floorRef.current;
      const live = (snapshotRef.current?.vehicles ?? []).filter(
        (vehicle) => !floor || vehicle.floorId === floor.id,
      );
      const visible = visibleAgentCount(live.length, vehicleViewportCapacity);
      for (let index = 0; index < visible; index++) {
        const world = agentWorldPosition(
          live[index],
          { width: worldWidth, height: worldHeight },
          viewMode,
        );
        dummy.position.set(world.x, world.y, viewMode === "3d" ? 0.75 : 0);
        // The box mesh's own long side points along +x at zero rotation
        // (`BoxGeometry(4, 1.8, 1.5)` below) — `sceneHeadingToRenderRotationZ`
        // is the scene-to-render heading transform this shares with the
        // crosswalk mesh (`simulationViewportPrimitiveMeshes.ts`).
        dummy.rotation.set(
          0,
          0,
          sceneHeadingToRenderRotationZ(live[index].headingRadians),
        );
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        vehicles.setMatrixAt(index, dummy.matrix);
      }
      renderedVehicleCount = commitInstances(vehicles, visible, renderedVehicleCount);
    }
    function renderFrame(time: number) {
      if (disposed || renderHalted || !renderer) {
        return;
      }
      const frameTime = Number.isFinite(time) ? time : performance.now();
      // Compat-mode frame cap (ADR-0006's "scale-limited compatibility mode"):
      // software WebGL rendering at the display's full rate measurably
      // saturates a main thread and starves pointer handling — the same
      // failure the home hero had. Full-GPU mode keeps every frame.
      if (frameIntervalMs > 0 && frameTime - lastRenderAtMs < frameIntervalMs) {
        return;
      }
      lastRenderAtMs = frameTime;
      try {
        // Per-frame animation for dynamic objects that want it (falling
        // rain, skeletal character walk cycles) — computed before
        // `updateAgentInstances` so it can drive the skeletal layer's
        // AnimationMixer with the same delta.
        const frameSeconds = (frameTime - lastFrameAt) / 1000;
        updateAgentInstances(frameSeconds);
        updateVehicleInstances();
        for (const child of dynamicGroup.children) {
          (child.userData.tick as ((dt: number) => void) | undefined)?.(frameSeconds);
        }
        if (postProcessing) {
          try {
            postProcessing.render();
          } catch (error) {
            // The finishing pass is cosmetic: lose it, keep the city, say why.
            console.warn("3D post-processing disabled:", error);
            postProcessing.dispose();
            postProcessing = undefined;
            renderer.render(scene, camera);
          }
        } else {
          renderer.render(scene, camera);
        }
      } catch (error) {
        renderHalted = true;
        window.cancelAnimationFrame(animationFrameId);
        window.clearInterval(watchdogTimerId);
        setRenderMode("failed");
        setStatus(
          error instanceof Error
            ? rawStatus(error.message)
            : localizedStatus("renderFailed"),
        );
        return;
      }
      lastFrameAt = frameTime;
      frameCount++;
      if (frameTime - lastFpsUpdate >= 1000) {
        if (frameCount >= 30) {
          setFps(Math.round((frameCount * 1000) / (frameTime - lastFpsUpdate)));
        }
        frameCount = 0;
        lastFpsUpdate = frameTime;
      }
    }
    function scheduleAnimationFrame() {
      animationFrameId = window.requestAnimationFrame((time) => {
        renderFrame(time);
        if (!renderHalted) {
          scheduleAnimationFrame();
        }
      });
    }
    function startRenderLoop() {
      frameCount = 0;
      lastFpsUpdate = performance.now();
      lastFrameAt = lastFpsUpdate;
      setStatus(localizedStatus("rendering"));
      scheduleAnimationFrame();
      watchdogTimerId = window.setInterval(() => {
        if (!renderHalted && performance.now() - lastFrameAt > 250) {
          renderFrame(performance.now());
        }
      }, 1000 / 60);
    }
    async function start() {
      try {
        if (!("gpu" in navigator) || !navigator.gpu) {
          if (navigator.userAgent.includes("jsdom")) {
            setRenderMode("unsupported");
            setStatus(localizedStatus("webgpuUnavailable"));
            return;
          }
          setRenderMode("compat");
          frameIntervalMs = COMPAT_FRAME_INTERVAL_MS;
          renderer = createFallbackViewportRenderer(canvasElement);
          observeResize();
          seedAgents();
          seedVehicles();
          startRenderLoop();
          return;
        }
        setStatus(localizedStatus("requestingGpu"));
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        if (!adapter) {
          // ADR-0006: "WebGL/CPU is a labeled, scale-limited compatibility
          // mode with no silent degradation." A browser can expose
          // `navigator.gpu` yet yield no adapter (headless chromium, driver
          // blocklists, Linux without Vulkan) — that machine still gets the
          // compatibility mode, not the blocking card. The card is reserved
          // for when even WebGL cannot render. This closes the gap flagged
          // in docs/REVIEW-2026-09-19.md §7.
          try {
            renderer = createFallbackViewportRenderer(canvasElement);
          } catch {
            setRenderMode("unsupported");
            setStatus(localizedStatus("rendererFailed"));
            return;
          }
          setRenderMode("compat");
          frameIntervalMs = COMPAT_FRAME_INTERVAL_MS;
          observeResize();
          seedAgents();
          seedVehicles();
          startRenderLoop();
          return;
        }
        const device = await adapter.requestDevice();
        if (disposed) {
          // Torn down while the device was being created: the cleanup has
          // already run and could not see this device, so release it here.
          device.destroy();
          return;
        }
        gpuDevice = device;
        setRenderMode("full-gpu");
        setStatus(localizedStatus("initializing"));
        const gpuRenderer = createGpuViewportRenderer(canvasElement, device);
        renderer = gpuRenderer;
        await gpuRenderer.init();
        if (disposed) {
          return;
        }
        if (viewMode === "3d") {
          postProcessing = createViewportPostProcessing(gpuRenderer, scene, camera);
        }
        observeResize();
        seedAgents();
        seedVehicles();
        setStatus(localizedStatus("benchmarking"));
        const benchmarkFps = await benchmarkViewportRenderer(device, renderFrame);
        if (disposed) {
          return;
        }
        setFps(Math.round(benchmarkFps));
        startRenderLoop();
      } catch (error) {
        // Without this the 3D view stayed a black canvas: its status text is
        // only drawn in 2D, and "detecting" shows no notice.
        setRenderMode("failed");
        setStatus(
          error instanceof Error
            ? rawStatus(error.message)
            : localizedStatus("rendererFailed"),
        );
      }
    }
    sceneRef.current = scene;
    dynamicGroupRef.current = dynamicGroup;
    crowdMeshRef.current = figures?.group ?? agents ?? null;
    lightRigRef.current = lightRig ?? null;
    start().catch((error: unknown) => {
      setStatus(
        error instanceof Error
          ? rawStatus(error.message)
          : localizedStatus("rendererFailed"),
      );
    });
    return () => {
      disposed = true;
      sceneRef.current = null;
      dynamicGroupRef.current = null;
      crowdMeshRef.current = null;
      lightRigRef.current = null;
      detachCameraControls?.();
      if (placementRef.current === placement) placementRef.current = null;
      placement?.dispose();
      countLineDraft?.dispose();
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(watchdogTimerId);
      resizeObserver?.disconnect();
      postProcessing?.dispose();
      renderer?.dispose();
      gpuDevice?.destroy();
      figures?.dispose();
      skeletalCharacters?.dispose();
      agents?.geometry.dispose();
      agents?.material.dispose();
      vehicles.geometry.dispose();
      vehicles.material.dispose();
      lightRig?.dispose();
      dynamicGroup.children.slice().forEach(disposeRenderObject);
    };
  }, [hasScene, viewMode, worldHeight, worldWidth]);
  /*
   * Scene layer: everything drawn from the scene's geometry. Rebuilt when the
   * scene changes, inside the renderer layer's Three scene, without touching
   * the GPU device, camera or render loop. Declared after the renderer layer so
   * its Three scene exists when this runs.
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !crowdScene) {
      return;
    }
    let disposed = false;
    let loadedSceneAssets: Object3D[] = [];
    // The generated city brings its own ground in 3D.
    const floor = viewMode === "3d" ? undefined : createFloor(crowdScene);
    // The scene's walls. This used to be two hard-coded walls at fixed
    // coordinates that belonged to no scene at all.
    const walls = crowdScene.walls.flatMap((wall) => {
      const points = wall.geometry.points;
      return points
        .slice(1)
        .map((point, index) =>
          createWall(
            toRenderX(points[index].x, crowdScene),
            toRenderY(points[index].y, crowdScene),
            toRenderX(point.x, crowdScene),
            toRenderY(point.y, crowdScene),
            Math.max(0.2, wall.thickness),
            viewMode,
          ),
        );
    });
    const city = viewMode === "3d" ? createCityObjects(crowdScene) : undefined;
    const staticPlan = createSceneRenderPlan(crowdScene, 0);
    const staticCityObjects = createStaticRenderObjects(
      crowdScene,
      viewMode,
      staticPlan,
    );
    const owned: Object3D[] = [
      ...(floor ? [floor] : []),
      ...walls,
      ...staticCityObjects,
      ...(city?.objects ?? []),
    ];
    owned.forEach((object) => scene.add(object));
    cityRef.current = city ?? null;
    if (viewMode === "3d") {
      void Promise.all(
        // Baked streetscape scenes are superseded by the generated city; props
        // (a bus shelter, a kiosk) still load onto it.
        staticPlan.assets
          .filter((asset) => asset.kind !== "gltf-scene")
          .map(async (asset) => ({
            asset,
            object: await loadSceneVisualAssetObject(asset, crowdScene),
          })),
      ).then((loadedAssets) => {
        if (disposed) {
          loadedAssets.forEach(({ object }) => object && disposeRenderObject(object));
          return;
        }
        loadedSceneAssets = loadedAssets.flatMap(({ asset, object }) => {
          if (!object) {
            return [];
          }
          scene.getObjectByName(asset.id)?.removeFromParent();
          object.traverse((child) => {
            child.castShadow = true;
            child.receiveShadow = true;
          });
          scene.add(object);
          return [object];
        });
      });
    }
    return () => {
      disposed = true;
      if (cityRef.current === city) cityRef.current = null;
      [...owned, ...loadedSceneAssets].forEach((object) => {
        object.removeFromParent();
        disposeRenderObject(object);
      });
    };
  }, [crowdScene, viewMode]);
  useEffect(() => {
    layersRef.current = layers;
    applyViewportLayers(dynamicGroupRef.current, crowdMeshRef.current, layers);
  }, [layers]);
  useEffect(() => {
    const scene = sceneRef.current;
    const dynamicGroup = dynamicGroupRef.current;
    if (!scene || !dynamicGroup || !crowdScene) {
      return;
    }
    const plan = createSceneRenderPlan(crowdScene, sceneVisualSecond);
    const overlayPlan = createViewportOverlayPlan(crowdScene, {
      elapsedSeconds: sceneVisualSecond,
      heatmapCells,
    });
    const objects = createDynamicRenderObjects(crowdScene, viewMode, plan, overlayPlan);
    if (viewMode === "3d") {
      lightRigRef.current?.setTime(
        sceneVisualSecond,
        sceneAtmosphere(plan, sceneVisualSecond).overcast,
      );
      cityRef.current?.setNightLevel(cityNightLevel(sceneVisualSecond));
    }
    objects.forEach((object) => dynamicGroup.add(object));
    applyViewportLayers(dynamicGroup, crowdMeshRef.current, layersRef.current);
    applySceneAtmosphere(scene, plan, sceneVisualSecond, viewMode);
    return () => {
      objects.forEach((object) => {
        object.removeFromParent();
        disposeRenderObject(object);
      });
    };
  }, [sceneVisualSecond, crowdScene, heatmapCells, viewMode]);
  return { canvasRef, fps, renderMode, selectedAgentId, status };
}
