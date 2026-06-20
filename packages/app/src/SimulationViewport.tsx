import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { WebGPURenderer } from "three/webgpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { useI18n, type TranslationKey } from "./i18n";
import {
  performanceAgentCount,
  performanceBenchmarkFrames,
} from "./renderBenchmark";
import {
  agentWorldPosition,
  selectCrowdAgents,
  visibleAgentCount,
} from "./agentInstanceField";
import { agentAppearance } from "./agentAppearance";
import { dayNightLighting } from "./dayNightCycle";
import {
  orbitByDrag,
  zoomByWheel,
  orbitToPosition,
  positionToOrbit,
  type OrbitState,
} from "./orbitCamera";
import type { SimulationSnapshot } from "./simulationEngine";
import {
  selectViewportAgentAnnotations,
  selectViewportOverlayAgents,
  type ViewportAgentAnnotation,
  type ViewportAgentOverlayFrame,
} from "./simulationViewportOverlay";
import {
  createBioCityRenderPlan,
  type BioCityRenderPlan,
  type BioCityRenderAssetPlacement,
  type BioCityRenderPrimitive,
  type BioCityWeatherLine,
} from "./bioCityRenderPlan";
import {
  createBioCityViewportOverlayPlan,
  type BioCityViewportFlowOverlay,
  type BioCityViewportHeatmapOverlay,
  type BioCityViewportOverlayPlan,
  type BioCityViewportRiskOverlay,
} from "./bioCityViewportOverlayPlan";
import { loadBioCityVisualAssetObject } from "./bioCityModelAssets";
import type { HeatmapCell } from "./heatmap";

export type ViewMode = "2d" | "3d";

type RenderStatus =
  | {
      key: TranslationKey;
      type: "localized";
    }
  | {
      message: string;
      type: "raw";
    };

export function SimulationViewport({
  heatmapCells = [],
  scene: crowdScene,
  sharedAgentOverlay,
  snapshot,
  viewMode = "2d",
}: {
  heatmapCells?: readonly HeatmapCell[];
  scene?: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode?: ViewMode;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Latest snapshot, read each animation frame so the instanced crowd follows
  // the live simulation without recreating the scene.
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  // The worker path (default without WebGPU) keeps snapshot.agents empty and
  // streams live agent positions through the SharedArrayBuffer overlay instead.
  // Read the freshest overlay each frame so the instanced crowd has real
  // coordinates to render.
  const sharedOverlayRef = useRef(sharedAgentOverlay);
  useEffect(() => {
    sharedOverlayRef.current = sharedAgentOverlay;
  }, [sharedAgentOverlay]);
  // 2.5D orbit-camera state, kept across the 5s scene rebuilds so dragging the
  // city does not snap back. Seeded from the default framing on first 3d mount.
  const orbitRef = useRef<OrbitState | null>(null);
  // Active-drag state also lives in a ref so an in-flight drag survives the 5s
  // scene rebuild — otherwise the rebuilt effect resets a local `dragging` flag
  // and the gesture dies mid-drag (the rebuild re-binds the pointer handlers).
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const [status, setStatus] = useState<RenderStatus>(() => localizedStatus("starting"));
  const [fps, setFps] = useState(0);
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
    let loadedBioCityAssets: Object3D[] = [];
    const scene = new Scene();
    const camera =
      viewMode === "3d"
        ? new PerspectiveCamera(48, 16 / 10, 0.1, 140)
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
    // Lit + self-illuminated so the 3d crowd reads as warm figures that stand
    // out from the cool, pale scene; flat unlit for the top-down 2d view. See
    // agentAppearance for why 3d figures are widened past human scale.
    const agentMaterial =
      viewMode === "3d"
        ? new MeshStandardMaterial({
            color: agentLook.color,
            emissive: agentLook.emissive,
            emissiveIntensity: agentLook.emissiveIntensity,
            roughness: 0.5,
          })
        : new MeshBasicMaterial({ color: agentLook.color });
    const agents = new InstancedMesh(
      agentGeometry,
      agentMaterial,
      performanceAgentCount,
    );
    // Dynamic instanced crowd: never frustum-cull. Instance matrices move across
    // the scene each frame while the geometry bounding sphere stays at the
    // origin, so culling would wrongly hide the whole mesh.
    agents.frustumCulled = false;
    const floor = createFloor(crowdScene, viewMode);
    const walls = [
      createWall(-13, 4, 5, 9, 0.32, viewMode),
      createWall(5, -8, 15, -2, 0.32, viewMode),
    ];
    const bioCityPlan = crowdScene
      ? createBioCityRenderPlan(crowdScene, bioCityVisualSecond)
      : undefined;
    const bioCityOverlayPlan = crowdScene
      ? createBioCityViewportOverlayPlan(crowdScene, {
          elapsedSeconds: bioCityVisualSecond,
          heatmapCells,
        })
      : undefined;
    const bioCityObjects =
      crowdScene && bioCityPlan
        ? createBioCityObjects(crowdScene, viewMode, bioCityPlan, bioCityOverlayPlan)
        : [];

    function createRenderer(device: GPUDevice) {
      return new WebGPURenderer({
        alpha: true,
        antialias: false,
        canvas: canvasElement,
        depth: false,
        device,
        powerPreference: "high-performance",
        stencil: false,
      });
    }

    function createFallbackRenderer() {
      return new WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas: canvasElement,
        depth: false,
        powerPreference: "high-performance",
        stencil: false,
      });
    }

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

    function onPointerDown(event: PointerEvent) {
      dragRef.current = { active: true, x: event.clientX, y: event.clientY };
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
      dragRef.current.active = false;
      canvasElement.releasePointerCapture(event.pointerId);
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
          x: worldWidth * 0.42,
          y: -worldHeight * 0.58,
          z: worldHeight * 0.42,
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
    scene.background = new Color("#07131f");

    agents.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(floor);
    scene.add(agents);
    walls.forEach((wall) => scene.add(wall));
    bioCityObjects.forEach((object) => scene.add(object));

    // Lighting follows the simulation clock (day -> night -> day) so the 3d
    // city reads as living. Only the lights change; the scene background stays
    // owned by the weather layer. Agents self-illuminate (emissive), so they
    // stay visible even at night.
    if (viewMode === "3d") {
      const lighting = dayNightLighting(bioCityVisualSecond);
      const hemisphereLight = new HemisphereLight(
        lighting.hemiSky,
        lighting.hemiGround,
        lighting.hemiIntensity,
      );
      const keyLight = new DirectionalLight(lighting.keyColor, lighting.keyIntensity);
      keyLight.position.set(worldWidth * 0.3, -worldHeight * 0.35, worldHeight);
      const fillLight = new AmbientLight("#ffffff", lighting.ambientIntensity);
      scene.add(hemisphereLight, keyLight, fillLight);
    }
    if (bioCityPlan) {
      scene.background = new Color(
        bioCityPlan.weather.fogDensity > 0
          ? "#182832"
          : bioCityPlan.weather.precipitationIntensity > 0
            ? "#101f2c"
            : "#07131f",
      );
    }
    if (crowdScene && bioCityPlan && viewMode === "3d") {
      void Promise.all(
        bioCityPlan.assets.map(async (asset) => ({
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
          scene.add(object);

          return [object];
        });
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

    let renderedAgentCount = 0;

    // Initial state: every instance hidden (scale 0). updateAgentInstances then
    // reveals only the live agents each frame.
    function seedAgents() {
      for (let index = 0; index < performanceAgentCount; index++) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, 0, -1000);
        dummy.updateMatrix();
        agents.setMatrixAt(index, dummy.matrix);
      }

      agents.instanceMatrix.needsUpdate = true;
    }

    // Drive the instanced mesh from the live simulation snapshot: position the
    // first N instances at the real agents, hide any that were visible last
    // frame but no longer are. This replaces the static benchmark grid.
    function updateAgentInstances() {
      const live = selectCrowdAgents(
        snapshotRef.current?.agents,
        sharedOverlayRef.current?.agents,
      );
      const visible = visibleAgentCount(live.length, performanceAgentCount);

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

      renderedAgentCount = visible;
      agents.instanceMatrix.needsUpdate = true;
    }

    function renderFrame(time: number) {
      if (disposed || !renderer) {
        return;
      }

      const frameTime = Number.isFinite(time) ? time : performance.now();

      try {
        updateAgentInstances();
        renderer.render(scene, camera);
      } catch (error) {
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
        scheduleAnimationFrame();
      });
    }

    async function benchmarkRenderer(device: GPUDevice) {
      const sampleFrames = performanceBenchmarkFrames;
      const startedAt = performance.now();

      for (let index = 0; index < sampleFrames; index++) {
        renderFrame(startedAt + index * (1000 / 60));
      }

      await device.queue.onSubmittedWorkDone();

      return (sampleFrames * 1000) / Math.max(1, performance.now() - startedAt);
    }

    async function start() {
      try {
        if (!("gpu" in navigator) || !navigator.gpu) {
          if (navigator.userAgent.includes("jsdom")) {
            setStatus(localizedStatus("webgpuUnavailable"));
            return;
          }

          renderer = createFallbackRenderer();
          resize();
          seedAgents();
          setStatus(localizedStatus("rendering"));
          scheduleAnimationFrame();
          watchdogTimerId = window.setInterval(() => {
            if (performance.now() - lastFrameAt > 250) {
              renderFrame(performance.now());
            }
          }, 1000 / 60);
          return;
        }

        setStatus(localizedStatus("requestingGpu"));

        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: "high-performance",
        });

        if (!adapter) {
          setStatus(localizedStatus("noWebGpuAdapter"));
          return;
        }

        const device = await adapter.requestDevice();

        if (disposed) {
          device.destroy();
          return;
        }

        setStatus(localizedStatus("initializing"));
        renderer = createRenderer(device);
        await renderer.init();

        if (disposed) {
          return;
        }

        resize();
        seedAgents();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvasElement.parentElement ?? canvasElement);

        setStatus(localizedStatus("benchmarking"));
        const benchmarkFps = await benchmarkRenderer(device);

        if (disposed) {
          return;
        }

        setFps(Math.round(benchmarkFps));
        frameCount = 0;
        lastFpsUpdate = performance.now();
        lastFrameAt = lastFpsUpdate;
        setStatus(localizedStatus("rendering"));
        scheduleAnimationFrame();
        watchdogTimerId = window.setInterval(() => {
          if (performance.now() - lastFrameAt > 250) {
            renderFrame(performance.now());
          }
        }, 1000 / 60);
      } catch (error) {
        setStatus(
          error instanceof Error
            ? rawStatus(error.message)
            : localizedStatus("rendererFailed"),
        );
      }
    }

    start();

    return () => {
      disposed = true;
      canvasElement.removeEventListener("pointerdown", onPointerDown);
      canvasElement.removeEventListener("pointermove", onPointerMove);
      canvasElement.removeEventListener("pointerup", onPointerUp);
      canvasElement.removeEventListener("wheel", onWheel);
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(watchdogTimerId);
      resizeObserver?.disconnect();
      renderer?.dispose();
      agentGeometry.dispose();
      agentMaterial.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      walls.forEach((wall) => {
        wall.geometry.dispose();
        wall.material.dispose();
      });
      bioCityObjects.forEach((object) => {
        disposeRenderObject(object);
      });
      loadedBioCityAssets.forEach(disposeRenderObject);
    };
  }, [bioCityVisualSecond, crowdScene, heatmapCells, viewMode]);

  return (
    <div
      className={`render-viewport ${
        viewMode === "3d" ? "render-viewport-3d" : "render-viewport-2d"
      }`}
    >
      <canvas ref={canvasRef} />
      <ViewportLiveAgentOverlay
        scene={crowdScene}
        sharedAgentOverlay={sharedAgentOverlay}
        snapshot={snapshot}
        viewMode={viewMode}
      />
      <ViewportCityLabelOverlay scene={crowdScene} viewMode={viewMode} />
      <div className="render-hud" aria-label={t("renderStatus")}>
        <span>{status.type === "localized" ? t(status.key) : status.message}</span>
        <strong>
          {(snapshot?.agentCount ?? 0).toLocaleString()} {t("visualAgents")}
        </strong>
        <span>{viewMode === "3d" ? t("view3d") : t("view2d")}</span>
        <span>{t("renderBenchmark")}</span>
        <span>{fps > 0 ? `${fps} fps` : "..."}</span>
      </div>
    </div>
  );
}

function ViewportLiveAgentOverlay({
  scene,
  sharedAgentOverlay,
  snapshot,
  viewMode,
}: {
  scene?: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode: ViewMode;
}) {
  const overlayAgents = scene
    ? selectViewportAgentAnnotations({
        scene,
        sharedAgentOverlay,
        snapshot,
        viewMode,
      })
    : selectViewportOverlayAgents(snapshot, sharedAgentOverlay).map((agent) => ({
        depth: 0,
        icon: "i",
        id: agent.id,
        intent: "seekService" as const,
        label: "Seeking service",
        leftPercent: 0,
        topPercent: 0,
      }));
  const agents =
    scene && overlayAgents.length === 0
      ? createAmbientAgentAnnotations(scene, viewMode)
      : overlayAgents;

  if (!scene || agents.length === 0) {
    return null;
  }

  return (
    <div
      className={`render-agent-overlay ${
        viewMode === "3d" ? "render-agent-overlay-3d" : "render-agent-overlay-2d"
      }`}
      aria-hidden="true"
    >
      {agents.map((agent) => (
        <span
          key={agent.id}
          className="render-agent-marker"
          style={{
            left: `${agent.leftPercent}%`,
            top: `${agent.topPercent}%`,
            zIndex: Math.round(agent.depth * 1000),
          }}
        >
          <span className="render-agent-dot" />
          <span className="render-agent-intent" title={agent.label}>
            {agent.icon}
          </span>
        </span>
      ))}
    </div>
  );
}

function ViewportCityLabelOverlay({
  scene,
  viewMode,
}: {
  scene?: CrowdSimScene;
  viewMode: ViewMode;
}) {
  if (!scene) {
    return null;
  }

  const labels = createCityLabels(scene, viewMode);

  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="render-city-label-overlay" aria-hidden="true">
      {labels.map((label) => (
        <span
          key={label.id}
          className={`render-city-label render-city-label-${label.kind}`}
          style={{
            left: `${label.leftPercent}%`,
            top: `${label.topPercent}%`,
            zIndex: label.zIndex,
          }}
        >
          <strong>{label.title}</strong>
          <span>{label.value}</span>
        </span>
      ))}
    </div>
  );
}

function createAmbientAgentAnnotations(
  scene: CrowdSimScene,
  viewMode: ViewMode,
): ViewportAgentAnnotation[] {
  const seeds = scene.roads.flatMap((road) => road.geometry.points);
  const fallbackSeeds = [
    { x: scene.world.width * 0.25, y: scene.world.height * 0.55 },
    { x: scene.world.width * 0.45, y: scene.world.height * 0.5 },
    { x: scene.world.width * 0.65, y: scene.world.height * 0.58 },
  ];
  const points = seeds.length > 0 ? seeds : fallbackSeeds;
  const intents = [
    { icon: "$", intent: "browseFashion" as const, label: "Shopping" },
    { icon: "C", intent: "buyCoffee" as const, label: "Coffee" },
    { icon: "F", intent: "eatMeal" as const, label: "Dining" },
    { icon: "Q", intent: "queue" as const, label: "Queueing" },
    { icon: "M", intent: "meetCompanion" as const, label: "Meeting" },
    { icon: ">", intent: "goToExit" as const, label: "Going to exit" },
  ];

  return Array.from({ length: viewMode === "3d" ? 42 : 64 }, (_, index) => {
    const point = points[index % points.length];
    const laneOffset = ((index % 7) - 3) * 1.8;
    const waveOffset = Math.sin(index * 1.7 + scene.seed) * 3.4;
    const position = projectScenePointToOverlay(
      {
        x: clampNumber(
          point.x + waveOffset + (index % 3) * 5.2,
          2,
          scene.world.width - 2,
        ),
        y: clampNumber(point.y + laneOffset, 2, scene.world.height - 2),
      },
      scene,
      viewMode,
    );
    const intent = intents[index % intents.length];

    return {
      depth: position.depth,
      icon: intent.icon,
      id: -index - 1,
      intent: intent.intent,
      label: intent.label,
      leftPercent: position.leftPercent,
      topPercent: position.topPercent,
    };
  }).sort((left, right) => left.depth - right.depth);
}

function createCityLabels(scene: CrowdSimScene, viewMode: ViewMode) {
  const buildingLabels = scene.buildings.slice(0, 4).map((building) => {
    const bounds = primitiveBounds(building.footprint.points);
    const position = projectScenePointToOverlay(bounds.center, scene, viewMode);

    return {
      id: building.id,
      kind: "building",
      leftPercent: position.leftPercent,
      title: building.name ?? building.id,
      topPercent: position.topPercent - 4,
      value: `${building.visitorCapacity ?? building.workerCapacity ?? 0}人`,
      zIndex: 200 + Math.round(position.depth * 100),
    };
  });
  const shopLabels = scene.shops.slice(0, 4).map((shop) => {
    const position = projectScenePointToOverlay(shop.position, scene, viewMode);

    return {
      id: shop.id,
      kind: "shop",
      leftPercent: position.leftPercent,
      title: shop.name,
      topPercent: position.topPercent - 3,
      value: `${Math.round(shop.attraction * 100)}% 吸引`,
      zIndex: 240 + Math.round(position.depth * 100),
    };
  });
  const transitLabels = scene.transitStops.slice(0, 3).map((stop) => {
    const position = projectScenePointToOverlay(stop.position, scene, viewMode);

    return {
      id: stop.id,
      kind: "transit",
      leftPercent: position.leftPercent,
      title: stop.name ?? stop.id,
      topPercent: position.topPercent - 2,
      value: `${stop.capacity}人容量`,
      zIndex: 260 + Math.round(position.depth * 100),
    };
  });
  const hazardLabels = scene.hazards.slice(0, 2).map((hazard) => {
    const position = projectScenePointToOverlay(hazard.position, scene, viewMode);

    return {
      id: hazard.id,
      kind: "hazard",
      leftPercent: position.leftPercent,
      title: hazard.name ?? hazard.id,
      topPercent: position.topPercent,
      value: `风险 ${Math.round(hazard.riskScore * 100)}%`,
      zIndex: 280 + Math.round(position.depth * 100),
    };
  });

  return [...buildingLabels, ...shopLabels, ...transitLabels, ...hazardLabels];
}

function projectScenePointToOverlay(
  point: ScenePoint,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  if (viewMode === "2d") {
    return {
      depth: clampNumber(point.y / scene.world.height, 0, 1),
      leftPercent: clampNumber((point.x / scene.world.width) * 100, 4, 96),
      topPercent: clampNumber((point.y / scene.world.height) * 100, 4, 96),
    };
  }

  const normalizedX = point.x / scene.world.width - 0.5;
  const normalizedY = point.y / scene.world.height - 0.5;

  return {
    depth: clampNumber(
      (point.y + point.x * 0.18) / (scene.world.height + scene.world.width * 0.18),
      0,
      1,
    ),
    leftPercent: clampNumber(50 + normalizedX * 58 + normalizedY * 18, 5, 95),
    topPercent: clampNumber(54 + normalizedY * 32 - normalizedX * 10, 7, 92),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function localizedStatus(key: TranslationKey): RenderStatus {
  return {
    key,
    type: "localized",
  };
}

function rawStatus(message: string): RenderStatus {
  return {
    message,
    type: "raw",
  };
}

function createFloor(scene: CrowdSimScene | undefined, viewMode: ViewMode) {
  const geometry = new PlaneGeometry(
    (scene?.world.width ?? 80) * 1.08,
    (scene?.world.height ?? 48) * 1.08,
  );
  const material = new MeshBasicMaterial({
    color: viewMode === "3d" ? "#22323a" : "#102232",
  });
  const floor = new Mesh(geometry, material);

  floor.position.set(0, 0, -0.02);

  return floor;
}

function createWall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  viewMode: ViewMode,
) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const height = viewMode === "3d" ? 2.4 : 0.04;
  const geometry = new BoxGeometry(length, thickness, height);
  const material = new MeshBasicMaterial({ color: "#2f332e" });
  const wall = new InstancedMesh(geometry, material, 1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const matrix = new Matrix4();

  matrix.makeRotationZ(angle);
  matrix.setPosition((x1 + x2) / 2, (y1 + y2) / 2, height / 2);
  wall.setMatrixAt(0, matrix);

  return wall;
}

function createBioCityObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
  plan: BioCityRenderPlan,
  overlayPlan?: BioCityViewportOverlayPlan,
) {
  return [
    ...createBioCityOverlayObjects(scene, viewMode, overlayPlan),
    ...plan.primitives.map((primitive) =>
      createBioCityPrimitiveMesh(primitive, scene, viewMode),
    ),
    ...plan.assets.map((asset) =>
      createBioCityAssetPlaceholder(asset, scene, viewMode),
    ),
    ...createBioCitySceneDressingObjects(scene, viewMode),
    ...createBioCityWeatherObjects(scene, viewMode, plan),
  ];
}

function createBioCityOverlayObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
  overlayPlan?: BioCityViewportOverlayPlan,
) {
  if (!overlayPlan) {
    return [];
  }

  return [
    ...overlayPlan.heatmap.map((cell) =>
      createHeatmapOverlayMesh(cell, scene, viewMode),
    ),
    ...overlayPlan.flows.map((flow) => createFlowOverlayMesh(flow, scene, viewMode)),
    ...overlayPlan.risks.map((risk) => createRiskOverlayMesh(risk, scene, viewMode)),
  ];
}

function disposeRenderObject(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    materials.forEach((material) => material.dispose());
  });
}

function createBioCityPrimitiveMesh(
  primitive: BioCityRenderPrimitive,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  if (primitive.kind === "building") {
    const bounds = primitiveBounds(primitive.points);
    const height =
      viewMode === "3d" ? Math.max(1, primitive.heightMeters * 0.16) : 0.08;
    const group = new Group();
    const body = new Mesh(
      new BoxGeometry(bounds.width, bounds.height, height),
      new MeshBasicMaterial({ color: primitive.color }),
    );
    const roof = new Mesh(
      new BoxGeometry(bounds.width * 1.04, bounds.height * 1.04, 0.16),
      new MeshBasicMaterial({ color: "#d9e4ee" }),
    );
    const sign = new Mesh(
      new BoxGeometry(bounds.width * 0.55, 0.42, 0.36),
      new MeshBasicMaterial({ color: "#f59e0b" }),
    );

    body.position.set(0, 0, height / 2);
    roof.position.set(0, 0, height + 0.08);
    sign.position.set(0, -bounds.height / 2 - 0.08, Math.max(0.8, height * 0.54));
    group.add(body, roof, sign);

    for (let index = 0; index < 4; index++) {
      const strip = new Mesh(
        new BoxGeometry(bounds.width * 0.74, 0.06, 0.08),
        new MeshBasicMaterial({ color: "#a7f3ff" }),
      );
      strip.position.set(
        0,
        -bounds.height / 2 - 0.09,
        Math.max(0.52, height * (0.22 + index * 0.16)),
      );
      group.add(strip);
    }

    group.position.set(
      toRenderX(bounds.center.x, scene),
      toRenderY(bounds.center.y, scene),
      0,
    );

    return group;
  }

  if (primitive.kind === "transitStop") {
    const height = viewMode === "3d" ? 1.6 : 0.08;
    const group = new Group();
    const pole = new Mesh(
      new CylinderGeometry(primitive.radiusMeters, primitive.radiusMeters, height, 16),
      new MeshBasicMaterial({ color: primitive.color }),
    );
    const shelter = new Mesh(
      new BoxGeometry(primitive.radiusMeters * 2.4, 0.8, height * 0.74),
      new MeshBasicMaterial({ color: "#22d3ee", opacity: 0.7, transparent: true }),
    );

    pole.position.set(0, 0, height / 2);
    shelter.position.set(0, primitive.radiusMeters * 1.08, height * 0.55);
    group.add(pole, shelter);
    group.position.set(
      toRenderX(primitive.position.x, scene),
      toRenderY(primitive.position.y, scene),
      0,
    );

    return group;
  }

  if (primitive.kind === "hazard") {
    const mesh = new Mesh(
      new CylinderGeometry(primitive.radiusMeters, primitive.radiusMeters, 0.06, 32),
      new MeshBasicMaterial({
        color: primitive.color,
        opacity: primitive.opacity,
        transparent: true,
      }),
    );

    mesh.position.set(
      toRenderX(primitive.position.x, scene),
      toRenderY(primitive.position.y, scene),
      0.04,
    );

    return mesh;
  }

  const x1 = toRenderX(primitive.start.x, scene);
  const y1 = toRenderY(primitive.start.y, scene);
  const x2 = toRenderX(primitive.end.x, scene);
  const y2 = toRenderY(primitive.end.y, scene);

  if (primitive.kind === "road") {
    const group = new Group();
    group.add(
      createLineLikeMesh(x1, y1, x2, y2, primitive.widthMeters, "#2d3b40", 0.09),
    );
    group.add(
      createLineLikeMesh(
        x1,
        y1,
        x2,
        y2,
        Math.max(0.22, primitive.widthMeters * 0.08),
        primitive.color,
        0.16,
        0.88,
      ),
    );
    group.add(
      createLineLikeMesh(
        x1,
        y1,
        x2,
        y2,
        Math.max(0.12, primitive.widthMeters * 0.04),
        "#d9f99d",
        0.18,
        0.46,
      ),
    );
    return group;
  }

  return createLineLikeMesh(
    x1,
    y1,
    x2,
    y2,
    primitive.widthMeters,
    primitive.color,
    0.12,
  );
}

function createBioCitySceneDressingObjects(scene: CrowdSimScene, viewMode: ViewMode) {
  if (viewMode !== "3d") {
    return [];
  }

  const objects: Object3D[] = [];
  const roadPoints = scene.roads.flatMap((road) => road.geometry.points);

  roadPoints.forEach((point, index) => {
    if (index % 2 !== 0) {
      return;
    }

    objects.push(
      createTree(toRenderX(point.x + 4, scene), toRenderY(point.y + 5, scene)),
    );
    objects.push(
      createStreetLight(toRenderX(point.x - 5, scene), toRenderY(point.y - 4, scene)),
    );
  });

  scene.shops.slice(0, 6).forEach((shop, index) => {
    const marker = new Mesh(
      new BoxGeometry(shop.size.width * 0.82, 0.42, 0.72),
      new MeshBasicMaterial({ color: index % 2 === 0 ? "#f97316" : "#22c55e" }),
    );
    marker.position.set(
      toRenderX(shop.position.x, scene),
      toRenderY(shop.position.y - shop.size.height / 2 - 0.35, scene),
      1.24,
    );
    objects.push(marker);
  });

  return objects;
}

function createTree(x: number, y: number) {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.18, 0.24, 1.2, 8),
    new MeshBasicMaterial({ color: "#6b4f2a" }),
  );
  const crown = new Mesh(
    new CylinderGeometry(1.05, 0.74, 1.25, 10),
    new MeshBasicMaterial({ color: "#3f8f52" }),
  );

  trunk.position.set(0, 0, 0.6);
  crown.position.set(0, 0, 1.52);
  group.add(trunk, crown);
  group.position.set(x, y, 0);

  return group;
}

function createStreetLight(x: number, y: number) {
  const group = new Group();
  const pole = new Mesh(
    new CylinderGeometry(0.08, 0.1, 2.4, 8),
    new MeshBasicMaterial({ color: "#94a3b8" }),
  );
  const lamp = new Mesh(
    new BoxGeometry(0.74, 0.28, 0.18),
    new MeshBasicMaterial({ color: "#fde68a" }),
  );

  pole.position.set(0, 0, 1.2);
  lamp.position.set(0.28, 0, 2.38);
  group.add(pole, lamp);
  group.position.set(x, y, 0);

  return group;
}

function createBioCityWeatherObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
  plan: BioCityRenderPlan,
) {
  const rainObjects = plan.weather.rainStreaks.map((line) =>
    createWeatherLineMesh(line, scene, "#2563eb", 0.22 + line.intensity * 0.38, 0.08),
  );
  const windObjects = plan.weather.windIndicators.map((line) =>
    createWeatherLineMesh(line, scene, "#0f766e", 0.35 + line.intensity * 0.45, 0.18),
  );

  if (plan.weather.fogOpacity <= 0 || viewMode !== "3d") {
    return [...rainObjects, ...windObjects];
  }

  const fog = new Mesh(
    new PlaneGeometry(scene.world.width, scene.world.height),
    new MeshBasicMaterial({
      color: "#dbe4df",
      opacity: Math.min(0.38, plan.weather.fogOpacity),
      transparent: true,
    }),
  );

  fog.name = "weather-fog-veil";
  fog.position.set(0, 0, 2.2);

  return [...rainObjects, ...windObjects, fog];
}

function createHeatmapOverlayMesh(
  cell: BioCityViewportHeatmapOverlay,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  const geometry = new PlaneGeometry(cell.width, cell.height);
  const material = new MeshBasicMaterial({
    color: cell.color,
    opacity: viewMode === "3d" ? cell.opacity * 0.72 : cell.opacity,
    transparent: true,
  });
  const mesh = new Mesh(geometry, material);

  mesh.name = cell.id;
  mesh.position.set(
    toRenderX(cell.x + cell.width / 2, scene),
    toRenderY(cell.y + cell.height / 2, scene),
    viewMode === "3d" ? 0.13 : 0.03,
  );

  return mesh;
}

function createFlowOverlayMesh(
  flow: BioCityViewportFlowOverlay,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  const mesh = createLineLikeMesh(
    toRenderX(flow.start.x, scene),
    toRenderY(flow.start.y, scene),
    toRenderX(flow.end.x, scene),
    toRenderY(flow.end.y, scene),
    flow.widthMeters,
    flow.color,
    viewMode === "3d" ? 0.14 : 0.07,
    flow.opacity,
  );

  mesh.name = flow.id;
  mesh.position.z += viewMode === "3d" ? 0.15 : 0.03;

  return mesh;
}

function createRiskOverlayMesh(
  risk: BioCityViewportRiskOverlay,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  const height = viewMode === "3d" ? 0.16 : 0.06;
  const mesh = new Mesh(
    new CylinderGeometry(risk.radiusMeters, risk.radiusMeters, height, 32),
    new MeshBasicMaterial({
      color: risk.color,
      opacity: risk.opacity,
      transparent: true,
    }),
  );

  mesh.name = risk.id;
  mesh.position.set(
    toRenderX(risk.position.x, scene),
    toRenderY(risk.position.y, scene),
    viewMode === "3d" ? 0.22 : 0.08,
  );

  return mesh;
}

function createWeatherLineMesh(
  line: BioCityWeatherLine,
  scene: CrowdSimScene,
  color: string,
  opacity: number,
  width: number,
) {
  const mesh = createLineLikeMesh(
    toRenderX(line.start.x, scene),
    toRenderY(line.start.y, scene),
    toRenderX(line.end.x, scene),
    toRenderY(line.end.y, scene),
    width,
    color,
    0.06,
    Math.min(0.92, opacity),
  );

  mesh.name = `weather-${line.id}`;
  mesh.position.z = 2.6;

  return mesh;
}

function createBioCityAssetPlaceholder(
  asset: BioCityRenderAssetPlacement,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  const isSceneAsset = asset.kind === "gltf-scene" || asset.kind === "tileset";
  const height = viewMode === "3d" ? (isSceneAsset ? 1.2 : 1.8) : 0.08;
  const footprint = isSceneAsset ? 8 * asset.scale : 2.4 * asset.scale;
  const mesh = new Mesh(
    new BoxGeometry(footprint, footprint, height),
    new MeshBasicMaterial({
      color: isSceneAsset ? "#94a3b8" : "#f59e0b",
      opacity: isSceneAsset ? 0.2 : 0.72,
      transparent: true,
    }),
  );

  mesh.name = asset.id;
  mesh.position.set(
    toRenderX(asset.anchor.x, scene),
    toRenderY(asset.anchor.y, scene),
    asset.anchor.z + height / 2,
  );
  mesh.rotation.z = (asset.rotationDegrees * Math.PI) / 180;

  return mesh;
}

function createLineLikeMesh(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  height: number,
  opacity?: number,
) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const geometry = new BoxGeometry(length, Math.max(0.2, width), height);
  const material = new MeshBasicMaterial(
    opacity === undefined
      ? { color }
      : {
          color,
          opacity,
          transparent: true,
        },
  );
  const mesh = new Mesh(geometry, material);

  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, height / 2);
  mesh.rotation.z = Math.atan2(y2 - y1, x2 - x1);

  return mesh;
}

function primitiveBounds(points: readonly ScenePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    },
    height: Math.max(0.4, maxY - minY),
    width: Math.max(0.4, maxX - minX),
  };
}

function toRenderX(x: number, scene: CrowdSimScene) {
  return x - scene.world.width / 2;
}

function toRenderY(y: number, scene: CrowdSimScene) {
  return scene.world.height / 2 - y;
}
