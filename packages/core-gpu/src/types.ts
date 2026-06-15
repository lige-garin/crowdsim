export type AgentSoA = {
  capacity: number;
  count: number;
  positions: Float32Array;
  velocities: Float32Array;
  targetField: Uint32Array;
  state: Uint32Array;
  agentType: Uint32Array;
  speed: Float32Array;
  radius: Float32Array;
  flags: Uint32Array;
};

export type SpatialHashGridLayout = {
  width: number;
  height: number;
  cellSize: number;
  columns: number;
  rows: number;
  cellCount: number;
};

export type SpatialHashGridReadback = {
  cellIds: Uint32Array;
  cellCounts: Uint32Array;
  cellOffsets: Uint32Array;
  sortedAgentIds: Uint32Array;
};

export type DensityGridReadback = {
  cellCounts: Uint32Array;
  maxCount: number;
};

export type WallSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SocialForceParams = {
  dt: number;
  desiredSpeed: number;
  relaxationTime: number;
  agentRepulsionStrength: number;
  agentRepulsionRange: number;
  wallRepulsionStrength: number;
  wallRepulsionRange: number;
  maxSpeed: number;
};

export type SocialForceStepResult = {
  positions: Float32Array;
  velocities: Float32Array;
};

export type FlowField = {
  layout: SpatialHashGridLayout;
  targetCell: number;
  blocked: Uint8Array;
  distances: Float32Array;
  directions: Float32Array;
};

export type {
  NeuralResidualGpuContract,
  NeuralResidualGpuFeature,
  NeuralResidualGpuModel,
} from "./neuralResidualGpu";
