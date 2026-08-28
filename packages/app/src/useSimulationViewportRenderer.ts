import { useEffect, useRef, useState } from "react";
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
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
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { viewportAgentCapacity } from "./renderBenchmark";
import {
  agentWorldPosition,
  selectCrowdAgents,
  visibleAgentCount,
} from "./agentInstanceField";
import { agentAppearance } from "./agentAppearance";
import {
  orbitByDrag,
  zoomByWheel,
  orbitToPosition,
  positionToOrbit,
  type OrbitState,
} from "./orbitCamera";
import { isClick, screenToNdc } from "./agentPicking";
import type { SimulationSnapshot } from "./simulationEngine";
import type { ViewportAgentOverlayFrame } from "./simulationViewportOverlay";
import { createBioCityRenderPlan } from "./bioCityRenderPlan";
import { createBioCityViewportOverlayPlan } from "./bioCityViewportOverlayPlan";
import { loadBioCityVisualAssetObject } from "./bioCityModelAssets";
import type { ViewportLayers } from "./viewportLayers";
import type { HeatmapCell } from "./heatmap";
import type { RenderStatus, ViewMode } from "./simulationViewportTypes";
import type { ViewportRenderMode } from "./viewportRenderMode";
import { localizedStatus, rawStatus } from "./simulationViewportStatus";
import { applyViewportLayers } from "./simulationViewportLayerVisibility";
import {
  bioCityBackgroundColor,
  createBioCityDynamicObjects,
  createBioCityStaticObjects,
  createDayNightLights,
  createFloor,
  createWall,
  disposeRenderObject,
} from "./simulationViewportSceneObjects";
import {
  benchmarkViewportRenderer,
  createFallbackViewportRenderer,
  createGpuViewportRenderer,
} from "./simulationViewportRendererFactory";
type RendererArgs = {
  crowdScene?: CrowdSimScene;
  heatmapCells: readonly HeatmapCell[];
  layers: ViewportLayers;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode: ViewMode;
};
export function useSimulationViewportRenderer({
  crowdScene,
  heatmapCells,
  layers,
  sharedAgentOverlay,
  snapshot,
  viewMode,
}: RendererArgs) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const sharedOverlayRef = useRef(sharedAgentOverlay);
  useEffect(() => {
    sharedOverlayRef.current = sharedAgentOverlay;
  }, [sharedAgentOverlay]);
  const orbitRef = useRef<OrbitState | null>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, downX: 0, downY: 0 });
  const sceneRef = useRef<Scene | null>(null);
  const dynamicGroupRef = useRef<Group | null>(null);
  const crowdMeshRef = useRef<InstancedMesh | null>(null);
  const layersRef = useRef(layers);
  const [status, setStatus] = useState<RenderStatus>(() => localizedStatus("starting"));
  const [renderMode, setRenderMode] = useState<ViewportRenderMode>("detecting");
  const [fps, setFps] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const bioCityVisualSecond = Math.floor((snapshot?.elapsedSeconds ?? 0) / 5) * 5;
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
    let loadedBioCityAssets: Object3D[] = [];
    let renderHalted = false;
    const scene = new Scene();
    const camera =
      viewMode === "3d"
        ? new PerspectiveCamera(46, 16 / 10, 0.1, 320)
        : new OrthographicCamera(-26, 26, 17, -17, 0.1, 100);
    const dummy = new Object3D();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let lastFrameAt = lastFpsUpdate;
    const agentLook = agentAppearance(viewMode);
    const agentGeometry =
      viewMode === "3d"
        ? new BoxGeometry(agentLook.size.x, agentLook.size.y, agentLook.size.z)
        : new PlaneGeometry(agentLook.size.x, agentLook.size.y);
    const agentMaterial =
      viewMode === "3d"
        ? new MeshStandardMaterial({
            color: agentLook.color,
            emissive: agentLook.emissive,
            emissiveIntensity: agentLook.emissiveIntensity,
            roughness: 0.5,
            depthTest: false,
          })
        : new MeshBasicMaterial({ color: agentLook.color });
    const agents = new InstancedMesh(
      agentGeometry,
      agentMaterial,
      viewportAgentCapacity,
    );
    agents.frustumCulled = false;
    agents.renderOrder = 10;
    const floor = createFloor(crowdScene, viewMode);
    const walls = [
      createWall(-13, 4, 5, 9, 0.32, viewMode),
      createWall(5, -8, 15, -2, 0.32, viewMode),
    ];
    const staticPlan = crowdScene ? createBioCityRenderPlan(crowdScene, 0) : undefined;
    const staticCityObjects =
      crowdScene && staticPlan
        ? createBioCityStaticObjects(crowdScene, viewMode, staticPlan)
        : [];
    const dynamicGroup = new Group();
    dynamicGroup.name = "biocity-dynamic";
    const worldWidth = crowdScene?.world.width ?? 80;
    const worldHeight = crowdScene?.world.height ?? 48;
    function applyOrbit() {
      if (!orbitRef.current) {
        return;
      }
      const p = orbitToPosition(orbitRef.current);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(0, 0, 0);
    }
    const raycaster = new Raycaster();
    function pickAgentAt(clientX: number, clientY: number) {
      const rect = canvasElement.getBoundingClientRect();
      const ndc = screenToNdc(clientX, clientY, rect);
      raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
      agents.computeBoundingSphere();
      const hit = raycaster.intersectObject(agents)[0];
      if (hit?.instanceId == null) {
        setSelectedAgentId(null);
        return;
      }
      const live = selectCrowdAgents(
        snapshotRef.current?.agents,
        sharedOverlayRef.current?.agents,
      );
      const picked = live[hit.instanceId];
      setSelectedAgentId(picked ? picked.id : null);
    }
    function onPointerDown(event: PointerEvent) {
      dragRef.current = {
        active: true,
        x: event.clientX,
        y: event.clientY,
        downX: event.clientX,
        downY: event.clientY,
      };
      canvasElement.setPointerCapture(event.pointerId);
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragRef.current.active || !orbitRef.current) {
        return;
      }
      orbitRef.current = orbitByDrag(
        orbitRef.current,
        event.clientX - dragRef.current.x,
        event.clientY - dragRef.current.y,
      );
      dragRef.current.x = event.clientX;
      dragRef.current.y = event.clientY;
      applyOrbit();
    }
    function onPointerUp(event: PointerEvent) {
      const wasClick = isClick(
        event.clientX - dragRef.current.downX,
        event.clientY - dragRef.current.downY,
      );
      dragRef.current.active = false;
      canvasElement.releasePointerCapture(event.pointerId);
      if (wasClick) {
        pickAgentAt(event.clientX, event.clientY);
      }
    }
    function onWheel(event: WheelEvent) {
      if (!orbitRef.current) {
        return;
      }
      event.preventDefault();
      orbitRef.current = zoomByWheel(orbitRef.current, event.deltaY);
      applyOrbit();
    }
    if (viewMode === "3d") {
      camera.up.set(0, 0, 1);
      if (!orbitRef.current) {
        orbitRef.current = positionToOrbit({
          x: worldWidth * 0.5,
          y: -worldHeight * 0.92,
          z: worldHeight * 0.8,
        });
      }
      applyOrbit();
      canvasElement.addEventListener("pointerdown", onPointerDown);
      canvasElement.addEventListener("pointermove", onPointerMove);
      canvasElement.addEventListener("pointerup", onPointerUp);
      canvasElement.addEventListener("wheel", onWheel, { passive: false });
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, 40);
      camera.lookAt(0, 0, 0);
    }
    scene.background = new Color("#f6f9fc");
    agents.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(floor);
    scene.add(agents);
    scene.add(dynamicGroup);
    walls.forEach((wall) => scene.add(wall));
    staticCityObjects.forEach((object) => scene.add(object));
    if (crowdScene && staticPlan && viewMode === "3d") {
      void Promise.all(
        staticPlan.assets.map(async (asset) => ({
          asset,
          object: await loadBioCityVisualAssetObject(asset, crowdScene),
        })),
      ).then((loadedAssets) => {
        if (disposed) {
          loadedAssets.forEach(({ object }) => object && disposeRenderObject(object));
          return;
        }
        loadedBioCityAssets = loadedAssets.flatMap(({ asset, object }) => {
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
        if (loadedBioCityAssets.length > 0) {
          scene.children
            .filter((child) => child.name === "inline-building")
            .forEach((child) => {
              child.visible = false;
            });
        }
      });
    }
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
        const verticalExtent = (crowdScene?.world.height ?? 48) * 0.62;
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
    function seedAgents() {
      for (let index = 0; index < viewportAgentCapacity; index++) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, 0, -1000);
        dummy.updateMatrix();
        agents.setMatrixAt(index, dummy.matrix);
      }
      agents.count = 0;
      agents.instanceMatrix.needsUpdate = true;
    }
    function updateAgentInstances() {
      const live = selectCrowdAgents(
        snapshotRef.current?.agents,
        sharedOverlayRef.current?.agents,
      );
      const visible = visibleAgentCount(live.length, viewportAgentCapacity);
      for (let index = 0; index < visible; index++) {
        const world = agentWorldPosition(
          live[index],
          { width: worldWidth, height: worldHeight },
          viewMode,
        );
        dummy.position.set(world.x, world.y, world.z);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        agents.setMatrixAt(index, dummy.matrix);
      }
      for (let index = visible; index < renderedAgentCount; index++) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        agents.setMatrixAt(index, dummy.matrix);
      }
      const touched = Math.max(visible, renderedAgentCount);
      agents.count = visible;
      renderedAgentCount = visible;
      if (touched > 0) {
        agents.instanceMatrix.addUpdateRange(0, touched * 16);
        agents.instanceMatrix.needsUpdate = true;
      }
    }
    function renderFrame(time: number) {
      if (disposed || renderHalted || !renderer) {
        return;
      }
      const frameTime = Number.isFinite(time) ? time : performance.now();
      try {
        updateAgentInstances();
        renderer.render(scene, camera);
      } catch (error) {
        renderHalted = true;
        window.cancelAnimationFrame(animationFrameId);
        window.clearInterval(watchdogTimerId);
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
          renderer = createFallbackViewportRenderer(canvasElement);
          observeResize();
          seedAgents();
          startRenderLoop();
          return;
        }
        setStatus(localizedStatus("requestingGpu"));
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        if (!adapter) {
          setRenderMode("unsupported");
          setStatus(localizedStatus("noWebGpuAdapter"));
          return;
        }
        const device = await adapter.requestDevice();
        gpuDevice = device;
        if (disposed) {
          return;
        }
        setRenderMode("full-gpu");
        setStatus(localizedStatus("initializing"));
        renderer = createGpuViewportRenderer(canvasElement, device);
        await renderer.init();
        if (disposed) {
          return;
        }
        observeResize();
        seedAgents();
        setStatus(localizedStatus("benchmarking"));
        const benchmarkFps = await benchmarkViewportRenderer(device, renderFrame);
        if (disposed) {
          return;
        }
        setFps(Math.round(benchmarkFps));
        startRenderLoop();
      } catch (error) {
        setStatus(
          error instanceof Error
            ? rawStatus(error.message)
            : localizedStatus("rendererFailed"),
        );
      }
    }
    sceneRef.current = scene;
    dynamicGroupRef.current = dynamicGroup;
    crowdMeshRef.current = agents;
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
      canvasElement.removeEventListener("pointerdown", onPointerDown);
      canvasElement.removeEventListener("pointermove", onPointerMove);
      canvasElement.removeEventListener("pointerup", onPointerUp);
      canvasElement.removeEventListener("wheel", onWheel);
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(watchdogTimerId);
      resizeObserver?.disconnect();
      renderer?.dispose();
      gpuDevice?.destroy();
      agentGeometry.dispose();
      agentMaterial.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      walls.forEach((wall) => {
        wall.geometry.dispose();
        wall.material.dispose();
      });
      staticCityObjects.forEach(disposeRenderObject);
      dynamicGroup.children.slice().forEach(disposeRenderObject);
      loadedBioCityAssets.forEach(disposeRenderObject);
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
    const plan = createBioCityRenderPlan(crowdScene, bioCityVisualSecond);
    const overlayPlan = createBioCityViewportOverlayPlan(crowdScene, {
      elapsedSeconds: bioCityVisualSecond,
      heatmapCells,
    });
    const objects = createBioCityDynamicObjects(
      crowdScene,
      viewMode,
      plan,
      overlayPlan,
    );
    if (viewMode === "3d") {
      objects.push(...createDayNightLights(crowdScene, bioCityVisualSecond));
    }
    objects.forEach((object) => dynamicGroup.add(object));
    applyViewportLayers(dynamicGroup, crowdMeshRef.current, layersRef.current);
    scene.background = new Color(bioCityBackgroundColor(plan));
    return () => {
      objects.forEach((object) => {
        object.removeFromParent();
        disposeRenderObject(object);
      });
    };
  }, [bioCityVisualSecond, crowdScene, heatmapCells, viewMode]);
  return { canvasRef, fps, renderMode, selectedAgentId, status };
}
