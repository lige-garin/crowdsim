import type {
  AgentStateMachineProbeResult,
  DiscreteEventProbeResult,
  QueueSystemProbeResult,
  ShopDecisionProbeResult,
} from "./engine/behaviorWasm";
import type { EvacuationFlowPlan } from "./engine/evacuationPlan";
import type { MovementBackendProbeResult } from "./movementBackendProbe";
import type { SharedArrayBufferProbeResult } from "./sharedArrayBufferProbe";
import type { ViewMode } from "./viewport/SimulationViewport";
import type { WasmDecisionRuntimeState } from "./engine/wasmDecisionRuntime";

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

/**
 * The stage shows one thing at a time. It used to stack the render viewport,
 * the clock and the whole scene editor in a single scrolling column, so the
 * editor sat ~92% below the fold with no affordance that it existed and you
 * could never see the run and the geometry you were editing in the same
 * scroll position.
 */
export type StageTab = "run" | "edit";

export type SystemSignal = {
  label: string;
  value: string;
};
