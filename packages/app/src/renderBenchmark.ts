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
