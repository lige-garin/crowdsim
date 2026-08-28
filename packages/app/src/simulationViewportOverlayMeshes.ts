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

  fog.name = `${viewportLayerObjectPrefix.weather}-fog-veil`;
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
