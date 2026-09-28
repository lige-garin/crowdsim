import { useCallback, useEffect, useMemo, useState } from "react";
import {
  initBehaviorWasm,
  resetBehaviorModeWasm,
  triggerEvacuationWithBehaviorWasm,
} from "./behaviorWasm";
import { simulationRuntimeProfile } from "./simulationEngine";

export type BehaviorMode = {
  active: boolean;
  label: string;
};

export type WasmDecisionRuntimeState = {
  decisionBackend: "rule-ts" | "wasm-ready";
  decisionHz: number;
  decisionTickCount: number;
  evacuationActive: boolean;
  message: string;
  modeLabel: string;
  status: "checking" | "error" | "ready";
};

type WasmDecisionRuntimeActions = {
  reset: () => Promise<BehaviorMode>;
  triggerEvacuation: () => Promise<BehaviorMode>;
};

export type WasmDecisionRuntime = WasmDecisionRuntimeState & WasmDecisionRuntimeActions;

const fallbackEvacuationMode = {
  active: true,
  label: "Evacuating",
};

const fallbackNormalMode = {
  active: false,
  label: "Normal",
};

export function createWasmDecisionRuntimeState({
  decisionTickCount = 0,
  evacuationActive = false,
  message = "Checking",
  modeLabel = "Normal",
  status = "checking",
}: Partial<
  Omit<WasmDecisionRuntimeState, "decisionBackend" | "decisionHz">
> = {}): WasmDecisionRuntimeState {
  return {
    decisionBackend: status === "ready" ? "wasm-ready" : "rule-ts",
    decisionHz: simulationRuntimeProfile.decisionHz,
    decisionTickCount,
    evacuationActive,
    message,
    modeLabel,
    status,
  };
}

export function calculateDecisionTickCount(stepCount: number) {
  const movementHz = simulationRuntimeProfile.movementHz;
  const decisionHz = simulationRuntimeProfile.decisionHz;
  const stepsPerDecision = Math.max(1, Math.round(movementHz / decisionHz));

  return Math.floor(Math.max(0, stepCount) / stepsPerDecision);
}

export function createDecisionBackendValue(runtime: WasmDecisionRuntimeState) {
  const suffix = runtime.status === "error" ? " fallback" : "";

  return `${runtime.decisionBackend}${suffix} @ ${runtime.decisionHz}Hz`;
}

export function useWasmDecisionRuntime(stepCount: number): WasmDecisionRuntime {
  const [runtimeState, setRuntimeState] = useState<WasmDecisionRuntimeState>(() =>
    createWasmDecisionRuntimeState(),
  );

  useEffect(() => {
    let cancelled = false;

    initBehaviorWasm()
      .then(() => {
        if (!cancelled) {
          setRuntimeState((current) =>
            createWasmDecisionRuntimeState({
              decisionTickCount: current.decisionTickCount,
              evacuationActive: current.evacuationActive,
              message: "WASM decision runtime ready",
              modeLabel: current.modeLabel,
              status: "ready",
            }),
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRuntimeState((current) =>
            createWasmDecisionRuntimeState({
              decisionTickCount: current.decisionTickCount,
              evacuationActive: current.evacuationActive,
              message:
                error instanceof Error
                  ? error.message
                  : "WASM decision runtime unavailable",
              modeLabel: current.modeLabel,
              status: "error",
            }),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const triggerEvacuation = useCallback(async () => {
    try {
      const behaviorMode = await triggerEvacuationWithBehaviorWasm();

      setRuntimeState((current) =>
        createWasmDecisionRuntimeState({
          decisionTickCount: current.decisionTickCount,
          evacuationActive: behaviorMode.active,
          message: "WASM decision runtime active",
          modeLabel: behaviorMode.label,
          status: "ready",
        }),
      );

      return behaviorMode;
    } catch (error) {
      setRuntimeState((current) =>
        createWasmDecisionRuntimeState({
          decisionTickCount: current.decisionTickCount,
          evacuationActive: fallbackEvacuationMode.active,
          message:
            error instanceof Error
              ? error.message
              : "WASM decision runtime unavailable",
          modeLabel: fallbackEvacuationMode.label,
          status: "error",
        }),
      );

      return fallbackEvacuationMode;
    }
  }, []);

  const reset = useCallback(async () => {
    try {
      const behaviorMode = await resetBehaviorModeWasm();

      setRuntimeState((current) =>
        createWasmDecisionRuntimeState({
          decisionTickCount: current.decisionTickCount,
          evacuationActive: behaviorMode.active,
          message: "WASM decision runtime active",
          modeLabel: behaviorMode.label,
          status: "ready",
        }),
      );

      return behaviorMode;
    } catch (error) {
      setRuntimeState((current) =>
        createWasmDecisionRuntimeState({
          decisionTickCount: current.decisionTickCount,
          evacuationActive: fallbackNormalMode.active,
          message:
            error instanceof Error
              ? error.message
              : "WASM decision runtime unavailable",
          modeLabel: fallbackNormalMode.label,
          status: "error",
        }),
      );

      return fallbackNormalMode;
    }
  }, []);

  return useMemo(
    () => ({
      ...runtimeState,
      decisionTickCount: calculateDecisionTickCount(stepCount),
      reset,
      triggerEvacuation,
    }),
    [reset, runtimeState, stepCount, triggerEvacuation],
  );
}
