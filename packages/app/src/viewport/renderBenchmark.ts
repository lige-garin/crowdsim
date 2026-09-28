import { crowdBudget } from "../engine/crowdBudget";

export const performanceAgentCount = 100_000;
export const performanceAgentSpacing = 0.14;
export const performanceBenchmarkFrames = 45;

export const performanceGridColumns = Math.ceil(Math.sqrt(performanceAgentCount));
export const performanceGridRows = Math.ceil(
  performanceAgentCount / performanceGridColumns,
);

export function benchmarkAgentPosition(index: number): { x: number; y: number } {
  const column = index % performanceGridColumns;
  const row = Math.floor(index / performanceGridColumns);

  return {
    x: (column - performanceGridColumns / 2) * performanceAgentSpacing,
    y: (row - performanceGridRows / 2) * performanceAgentSpacing,
  };
}

/**
 * InstancedMesh capacity for the live crowd in the viewport.
 *
 * This is an allocation, not a claim. The viewport used to allocate
 * `performanceAgentCount` (100,000) instances, which meant every frame uploaded
 * a 6.4 MB instance-matrix buffer and shaded ~2.4M vertices in order to display
 * fewer than 2,000 agents. The engine's own cap is 2,000 (simulationEngine
 * `defaultMaxAgents`); this leaves 4x headroom for larger scenes without
 * pretending the renderer is doing 100k.
 */
export const viewportAgentCapacity = crowdBudget.renderCapacity;
