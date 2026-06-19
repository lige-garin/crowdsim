import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import type { HeatmapCell } from "./heatmap";
import { createBioCityWeatherRuntimeState } from "./bioCityWeatherSystem";

export type BioCityViewportHeatmapOverlay = {
  color: string;
  height: number;
  id: string;
  intensity: number;
  opacity: number;
  width: number;
  x: number;
  y: number;
};

export type BioCityViewportFlowOverlay = {
  color: string;
  end: ScenePoint;
  id: string;
  intensity: number;
  opacity: number;
  start: ScenePoint;
  transitOnly: boolean;
  widthMeters: number;
};

export type BioCityViewportRiskOverlay = {
  active: boolean;
  color: string;
  id: string;
  opacity: number;
  position: ScenePoint;
  radiusMeters: number;
  riskScore: number;
  severity: number;
};

export type BioCityViewportOverlayPlan = {
  flows: BioCityViewportFlowOverlay[];
  heatmap: BioCityViewportHeatmapOverlay[];
  risks: BioCityViewportRiskOverlay[];
  summary: {
    activeRiskCount: number;
    flowCount: number;
    heatmapCellCount: number;
    peakHeatmapIntensity: number;
  };
};

export function createBioCityViewportOverlayPlan(
  scene: CrowdSimScene,
  options: {
    elapsedSeconds?: number;
    heatmapCells?: readonly HeatmapCell[];
    maxHeatmapCells?: number;
  } = {},
): BioCityViewportOverlayPlan {
  const elapsedSeconds = options.elapsedSeconds ?? 0;
  const maxHeatmapCells = options.maxHeatmapCells ?? 120;
  const weatherState = createBioCityWeatherRuntimeState(scene, elapsedSeconds);
  const activeHazardIds = new Set(weatherState.activeHazardIds);
  const heatmap = createHeatmapOverlay(options.heatmapCells ?? [], maxHeatmapCells);
  const flows = createFlowOverlay(scene, activeHazardIds);
  const risks = createRiskOverlay(scene, activeHazardIds);

  return {
    flows,
    heatmap,
    risks,
    summary: {
      activeRiskCount: risks.filter((risk) => risk.active).length,
      flowCount: flows.length,
      heatmapCellCount: heatmap.length,
      peakHeatmapIntensity: heatmap.reduce(
        (peak, cell) => Math.max(peak, cell.intensity),
        0,
      ),
    },
  };
}

function createHeatmapOverlay(
  heatmapCells: readonly HeatmapCell[],
  maxHeatmapCells: number,
): BioCityViewportHeatmapOverlay[] {
  return [...heatmapCells]
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, Math.max(0, maxHeatmapCells))
    .map((cell) => ({
      color: heatmapColor(cell.intensity),
      height: cell.height,
      id: `viewport-${cell.id}`,
      intensity: round(cell.intensity),
      opacity: round(0.18 + Math.min(1, cell.intensity) * 0.46),
      width: cell.width,
      x: cell.x,
      y: cell.y,
    }));
}

function createFlowOverlay(
  scene: CrowdSimScene,
  activeHazardIds: ReadonlySet<string>,
): BioCityViewportFlowOverlay[] {
  return scene.roads.flatMap((road) => {
    const roadRisk = scene.hazards
      .filter(
        (hazard) => hazard.affectedRoadId === road.id && activeHazardIds.has(hazard.id),
      )
      .reduce((risk, hazard) => Math.max(risk, hazard.riskScore), 0);
    const baseIntensity = Math.min(1, (road.capacityPerMinute ?? 180) / 420);
    const intensity = round(Math.max(baseIntensity, roadRisk));
    const color = roadRisk > 0.2 ? "#ef4444" : road.transitOnly ? "#38bdf8" : "#22d3ee";

    return road.geometry.points.slice(1).map((point, index) => ({
      color,
      end: copyPoint(point),
      id: `flow-${road.id}-${index}`,
      intensity,
      opacity: round(0.32 + intensity * 0.42),
      start: copyPoint(road.geometry.points[index]),
      transitOnly: road.transitOnly,
      widthMeters: Math.max(0.8, road.widthMeters * (road.transitOnly ? 0.18 : 0.12)),
    }));
  });
}

function createRiskOverlay(
  scene: CrowdSimScene,
  activeHazardIds: ReadonlySet<string>,
): BioCityViewportRiskOverlay[] {
  return scene.hazards.map((hazard) => {
    const active = activeHazardIds.has(hazard.id);
    const riskScore = round(hazard.riskScore);
    const severity = round(hazard.severity);

    return {
      active,
      color: active ? "#ef4444" : "#f97316",
      id: `risk-${hazard.id}`,
      opacity: round(active ? 0.2 + Math.max(riskScore, severity) * 0.35 : 0.1),
      position: copyPoint(hazard.position),
      radiusMeters: hazard.radiusMeters,
      riskScore,
      severity,
    };
  });
}

function heatmapColor(intensity: number) {
  if (intensity >= 0.78) return "#ef4444";
  if (intensity >= 0.52) return "#f59e0b";
  if (intensity >= 0.28) return "#84cc16";

  return "#22d3ee";
}

function copyPoint(point: ScenePoint): ScenePoint {
  return { x: point.x, y: point.y };
}

function round(value: number) {
  return Number(value.toFixed(4));
}
