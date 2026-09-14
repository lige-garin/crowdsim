import { CylinderGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { BioCityRenderPlan, BioCityWeatherLine } from "./bioCityRenderPlan";
import type {
  BioCityViewportFlowOverlay,
  BioCityViewportHeatmapOverlay,
  BioCityViewportOverlayPlan,
  BioCityViewportRiskOverlay,
} from "./bioCityViewportOverlayPlan";
import { viewportLayerObjectPrefix } from "./viewportLayers";
import type { ViewMode } from "./simulationViewportTypes";
import { toRenderX, toRenderY } from "./simulationViewportGeometry";
import { createLineLikeMesh } from "./simulationViewportPrimitiveMeshes";
import { createRainField } from "./rainField";

export function createBioCityOverlayObjects(
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
export function createBioCityWeatherObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
  plan: BioCityRenderPlan,
) {
  if (viewMode === "3d") {
    const intensity = plan.weather.precipitationIntensity;
    if (intensity <= 0) return [];
    const margin = 20;
    const halfWidth = scene.world.width / 2 + margin;
    const halfHeight = scene.world.height / 2 + margin;
    return [
      createRainField({
        bounds: {
          maxX: halfWidth,
          maxY: halfHeight,
          minX: -halfWidth,
          minY: -halfHeight,
        },
        intensity,
        name: `${viewportLayerObjectPrefix.weather}-rain`,
        seed: scene.seed,
        // The plan's wind is scene-space (y down) and scaled to 1 at 20 m/s;
        // streaks drift at a fraction of that so the rain leans, not blows.
        wind: { x: plan.weather.windVector.x * 6, y: -plan.weather.windVector.y * 6 },
      }),
    ];
  }

  return [
    ...plan.weather.rainStreaks.map((line) =>
      createWeatherLineMesh(line, scene, "#2563eb", 0.22 + line.intensity * 0.38, 0.08),
    ),
    ...plan.weather.windIndicators.map((line) =>
      createWeatherLineMesh(line, scene, "#0f766e", 0.35 + line.intensity * 0.45, 0.18),
    ),
  ];
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

  mesh.name = `${viewportLayerObjectPrefix.heatmap}-${cell.id}`;
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

  mesh.name = `${viewportLayerObjectPrefix.flow}-${flow.id}`;
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

  mesh.name = `${viewportLayerObjectPrefix.risk}-${risk.id}`;
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

  mesh.name = `${viewportLayerObjectPrefix.weather}-${line.id}`;
  mesh.position.z = 2.6;

  return mesh;
}
