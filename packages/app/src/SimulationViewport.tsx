import { useEffect, useRef, useState } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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
  benchmarkAgentPosition,
  performanceAgentCount,
  performanceBenchmarkFrames,
} from "./renderBenchmark";
import type { SimulationSnapshot } from "./simulationEngine";
import {
  selectViewportOverlayAgents,
  type ViewportAgentOverlayFrame,
} from "./simulationViewportOverlay";
import {
  createBioCityRenderPlan,
  type BioCityRenderPlan,
  type BioCityRenderAssetPlacement,
  type BioCityRenderPrimitive,
} from "./bioCityRenderPlan";
import { loadBioCityVisualAssetObject } from "./bioCityModelAssets";

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
  scene: crowdScene,
  sharedAgentOverlay,
  snapshot,
  viewMode = "2d",
}: {
  scene?: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode?: ViewMode;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

    const agentGeometry =
      viewMode === "3d"
        ? new BoxGeometry(0.12, 0.12, 0.45)
        : new PlaneGeometry(0.18, 0.18);
    const agentMaterial = new MeshBasicMaterial({
      color: viewMode === "3d" ? "#14759f" : "#118672",
    });
    const agents = new InstancedMesh(
      agentGeometry,
      agentMaterial,
      performanceAgentCount,
    );
    const floor = createFloor(viewMode);
    const walls = [
      createWall(-13, 4, 5, 9, 0.32, viewMode),
      createWall(5, -8, 15, -2, 0.32, viewMode),
    ];
    const bioCityPlan = crowdScene
      ? createBioCityRenderPlan(crowdScene, bioCityVisualSecond)
      : undefined;
    const bioCityObjects =
      crowdScene && bioCityPlan
        ? createBioCityObjects(crowdScene, viewMode, bioCityPlan)
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

    if (viewMode === "3d") {
      camera.up.set(0, 0, 1);
      camera.position.set(23, -28, 22);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, 40);
    }

    camera.lookAt(0, 0, 0);
    scene.background = new Color("#fdfbf4");

    agents.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(floor);
    scene.add(agents);
    walls.forEach((wall) => scene.add(wall));
    bioCityObjects.forEach((object) => scene.add(object));
    if (bioCityPlan) {
      scene.background = new Color(
        bioCityPlan.weather.fogDensity > 0
          ? "#dbe4df"
          : bioCityPlan.weather.precipitationIntensity > 0
            ? "#e8edf2"
            : "#fdfbf4",
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
        camera.left = -26 * aspect;
        camera.right = 26 * aspect;
        camera.top = 17;
        camera.bottom = -17;
      } else {
        camera.aspect = aspect;
      }

      camera.updateProjectionMatrix();
      renderer?.setSize(safeWidth, safeHeight, false);
    }

    function seedAgents() {
      for (let index = 0; index < performanceAgentCount; index++) {
        const { x, y } = benchmarkAgentPosition(index);

        dummy.position.set(x, y, viewMode === "3d" ? 0.23 : 0);
        dummy.updateMatrix();
        agents.setMatrixAt(index, dummy.matrix);
      }

      agents.instanceMatrix.needsUpdate = true;
    }

    function renderFrame(time: number) {
      if (disposed || !renderer) {
        return;
      }

      const frameTime = Number.isFinite(time) ? time : performance.now();

      try {
        agents.rotation.z = Math.sin(frameTime * 0.0002) * 0.025;
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
  }, [bioCityVisualSecond, crowdScene, viewMode]);

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
      <div className="render-hud" aria-label={t("renderStatus")}>
        <span>{status.type === "localized" ? t(status.key) : status.message}</span>
        <strong>
          {performanceAgentCount.toLocaleString()} {t("visualAgents")}
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
  const overlayAgents = selectViewportOverlayAgents(snapshot, sharedAgentOverlay);

  if (viewMode !== "2d" || !scene || overlayAgents.length === 0) {
    return null;
  }

  return (
    <div className="render-agent-overlay" aria-hidden="true">
      {overlayAgents.map((agent) => (
        <span
          key={agent.id}
          className="render-agent-dot"
          style={{
            left: `${toPercent(agent.x, scene.world.width)}%`,
            top: `${toPercent(agent.y, scene.world.height)}%`,
          }}
        />
      ))}
    </div>
  );
}

function toPercent(value: number, max: number) {
  if (!Number.isFinite(value) || max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / max) * 100));
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

function createFloor(viewMode: ViewMode) {
  const geometry = new PlaneGeometry(62, 40);
  const material = new MeshBasicMaterial({
    color: viewMode === "3d" ? "#ecf0e6" : "#fdfbf4",
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
) {
  return [
    ...plan.primitives.map((primitive) =>
      createBioCityPrimitiveMesh(primitive, scene, viewMode),
    ),
    ...plan.assets.map((asset) =>
      createBioCityAssetPlaceholder(asset, scene, viewMode),
    ),
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
    const mesh = new Mesh(
      new BoxGeometry(bounds.width, bounds.height, height),
      new MeshBasicMaterial({ color: primitive.color }),
    );

    mesh.position.set(
      toRenderX(bounds.center.x, scene),
      toRenderY(bounds.center.y, scene),
      height / 2,
    );

    return mesh;
  }

  if (primitive.kind === "transitStop") {
    const height = viewMode === "3d" ? 1.6 : 0.08;
    const mesh = new Mesh(
      new CylinderGeometry(primitive.radiusMeters, primitive.radiusMeters, height, 16),
      new MeshBasicMaterial({ color: primitive.color }),
    );

    mesh.position.set(
      toRenderX(primitive.position.x, scene),
      toRenderY(primitive.position.y, scene),
      height / 2,
    );

    return mesh;
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

  return createLineLikeMesh(
    toRenderX(primitive.start.x, scene),
    toRenderY(primitive.start.y, scene),
    toRenderX(primitive.end.x, scene),
    toRenderY(primitive.end.y, scene),
    primitive.widthMeters,
    primitive.color,
    primitive.kind === "road" && viewMode === "3d" ? 0.08 : 0.12,
  );
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
) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const geometry = new BoxGeometry(length, Math.max(0.2, width), height);
  const material = new MeshBasicMaterial({ color });
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
