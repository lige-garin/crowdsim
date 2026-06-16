import { useEffect, useState } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createWasmSimulationDecisionBackend } from "./behaviorWasm";
import type { SimulationDecisionBackend } from "./simulationDecisionBackend";

export type WasmSimulationDecisionBackendState = {
  backend?: SimulationDecisionBackend;
  message: string;
  status: "checking" | "error" | "ready";
};

export function useWasmSimulationDecisionBackend(
  scene: CrowdSimScene,
): WasmSimulationDecisionBackendState {
  const [state, setState] = useState<WasmSimulationDecisionBackendState>({
    message: "Checking WASM decision backend",
    status: "checking",
  });

  useEffect(() => {
    let cancelled = false;
    let backend: SimulationDecisionBackend | undefined;

    createWasmSimulationDecisionBackend(scene)
      .then((createdBackend) => {
        backend = createdBackend;

        if (cancelled) {
          backend.dispose?.();
          return;
        }

        setState({
          backend,
          message: "WASM decision backend controls live agent targets",
          status: "ready",
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            message:
              error instanceof Error
                ? error.message
                : "WASM decision backend unavailable",
            status: "error",
          });
        }
      });

    return () => {
      cancelled = true;
      backend?.dispose?.();
    };
  }, [scene]);

  return state;
}
