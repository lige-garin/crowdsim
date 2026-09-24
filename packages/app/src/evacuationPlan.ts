import {
  createFlowFieldCpu,
  createSpatialHashGridLayout,
  rasterizeWallsToBlockedCells,
  type FlowField,
  type SpatialHashGridLayout,
} from "@crowdsim/core-gpu";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { clamp } from "./numberUtils";
import type { LocalizedText } from "./i18n";
import type { SimulationAgent } from "./simulationEngine";
import { wallSegmentsFromScene } from "./sceneGeometry";

export type EvacuationFlowPlan = {
  blockedCells: number;
  exitId: string;
  flowField: FlowField;
  message: LocalizedText;
  reachableCells: number;
  sampleDirection: [number, number];
  targetCell: number;
};

const evacuationCellSize = 4;

export function createEvacuationFlowPlan(
  scene: CrowdSimScene,
  agents: SimulationAgent[],
): EvacuationFlowPlan {
  const exits = scene.entrances.filter((entrance) => entrance.kind !== "source");

  if (exits.length === 0) {
    throw new Error("Scene has no evacuation exit");
  }

  const origin =
    agents.length > 0 ? averageAgentPosition(agents) : firstSourcePosition(scene);
  const nearestExit = exits.reduce((best, candidate) =>
    distanceSq(candidate.position, origin) < distanceSq(best.position, origin)
      ? candidate
      : best,
  );
  const layout = createSpatialHashGridLayout({
    width: scene.world.width,
    height: scene.world.height,
    cellSize: evacuationCellSize,
  });
  const targetCell = pointToCellId(nearestExit.position, layout);
  const blocked = rasterizeWallsToBlockedCells(layout, wallSegmentsFromScene(scene));
  const flowField = createFlowFieldCpu({
    layout,
    targetCell,
    blocked,
  });
  const sampleCell = pointToCellId(origin, layout);

  return {
    blockedCells: countNonZero(flowField.blocked),
    exitId: nearestExit.id,
    flowField,
    message: {
      zh: `流场指向 ${nearestExit.id}`,
      en: `Flow field to ${nearestExit.id}`,
    },
    reachableCells: countReachable(flowField),
    sampleDirection: [
      flowField.directions[sampleCell * 2],
      flowField.directions[sampleCell * 2 + 1],
    ],
    targetCell,
  };
}

function firstSourcePosition(scene: CrowdSimScene): ScenePoint {
  return (
    scene.entrances.find((entrance) => entrance.kind !== "sink")?.position ?? {
      x: scene.world.width / 2,
      y: scene.world.height / 2,
    }
  );
}

function averageAgentPosition(agents: SimulationAgent[]): ScenePoint {
  const total = agents.reduce(
    (sum, agent) => ({
      x: sum.x + agent.x,
      y: sum.y + agent.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / agents.length,
    y: total.y / agents.length,
  };
}

function pointToCellId(point: ScenePoint, layout: SpatialHashGridLayout): number {
  const column = clamp(Math.floor(point.x / layout.cellSize), 0, layout.columns - 1);
  const row = clamp(Math.floor(point.y / layout.cellSize), 0, layout.rows - 1);

  return row * layout.columns + column;
}

function distanceSq(left: ScenePoint, right: ScenePoint) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;

  return dx * dx + dy * dy;
}

function countReachable(flowField: FlowField) {
  return Array.from(flowField.distances).filter(Number.isFinite).length;
}

function countNonZero(values: Uint8Array) {
  return values.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
}
