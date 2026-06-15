import type {
  AgentStateMachineProbeResult,
  DiscreteEventProbeResult,
  QueueSystemProbeResult,
  ShopDecisionProbeResult,
} from "./behaviorWasm";
import type { EvacuationFlowPlan } from "./evacuationPlan";
import type { MovementBackendProbeResult } from "./movementBackendProbe";
import type { SharedArrayBufferProbeResult } from "./sharedArrayBufferProbe";
import type { ViewMode } from "./SimulationViewport";
import type { WasmDecisionRuntimeState } from "./wasmDecisionRuntime";

export type EvacuationCurvePoint = {
  elapsedSeconds: number;
  exited: number;
  remaining: number;
};

export type EvacuationState = {
  active: boolean;
  baselineExited: number;
  curve: EvacuationCurvePoint[];
  flowPlan: EvacuationFlowPlan | null;
  label: string;
  startedAtSeconds: number;
};

export type DiscreteEventProbeState =
  | (DiscreteEventProbeResult & {
      status: "ready";
      message: string;
    })
  | {
      labels: string[];
      message: string;
      now: number;
      pending: number;
      ready: number;
      status: "checking" | "error";
    };

export type AgentStateProbeState =
  | (AgentStateMachineProbeResult & {
      message: string;
      status: "ready";
    })
  | {
      finalCode: number;
      labels: string[];
      message: string;
      restoredLabel: string;
      sabStateLabels: string[];
      status: "checking" | "error";
    };

export type ShopDecisionProbeState =
  | (ShopDecisionProbeResult & {
      message: string;
      status: "ready";
    })
  | {
      browserSummary: string;
      commuterChoice: string;
      goalChoice: string;
      message: string;
      profileLabels: string[];
      shopCount: number;
      status: "checking" | "error";
    };

export type QueueSystemProbeState =
  | (QueueSystemProbeResult & {
      message: string;
      status: "ready";
    })
  | {
      dequeued: number[];
      layout: string;
      message: string;
      serviceTimes: number[];
      status: "checking" | "error";
      throughput: number;
    };

export type MovementBackendProbeState = MovementBackendProbeResult;

export type DecisionRuntimeState = WasmDecisionRuntimeState;

export type SharedArrayBufferProbeState = SharedArrayBufferProbeResult;

export type StageViewMode = ViewMode | "network";

export type SystemSignal = {
  label: string;
  value: string;
};
