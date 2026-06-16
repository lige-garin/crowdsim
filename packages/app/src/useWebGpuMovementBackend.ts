import { useEffect, useState } from "react";
import {
  compareMovementBackends,
  createCpuMovementBackend,
  createMovementBackendProbeFixture,
  createWebGpuMovementBackend,
  type MovementBackend,
} from "./movementBackend";

export type WebGpuMovementBackendState = {
  backend?: MovementBackend;
  message: string;
  status: "checking" | "error" | "ready" | "unsupported";
};

export function useWebGpuMovementBackend(): WebGpuMovementBackendState {
  const [state, setState] = useState<WebGpuMovementBackendState>({
    message: "Checking WebGPU movement backend",
    status: "checking",
  });

  useEffect(() => {
    let cancelled = false;
    let device: GPUDevice | undefined;

    async function createBackend() {
      if (!("gpu" in navigator) || !navigator.gpu) {
        return {
          message: "WebGPU movement backend unavailable",
          status: "unsupported" as const,
        };
      }

      const adapter = await navigator.gpu.requestAdapter();

      if (!adapter) {
        return {
          message: "No WebGPU movement adapter",
          status: "unsupported" as const,
        };
      }

      device = await adapter.requestDevice();

      const alignment = await compareMovementBackends(
        createCpuMovementBackend(),
        createWebGpuMovementBackend(device),
        createMovementBackendProbeFixture(),
      );

      if (!alignment.matches) {
        device.destroy();
        device = undefined;

        return {
          message: `WebGPU movement readback mismatch p=${alignment.positionsDelta.toFixed(6)} v=${alignment.velocitiesDelta.toFixed(6)}`,
          status: "error" as const,
        };
      }

      return {
        backend: createWebGpuMovementBackend(device, "active"),
        message: "WebGPU movement backend drives live simulation",
        status: "ready" as const,
      };
    }

    createBackend()
      .then((nextState) => {
        if (cancelled) {
          device?.destroy();
          return;
        }

        setState(nextState);
      })
      .catch((error) => {
        device?.destroy();
        device = undefined;

        if (!cancelled) {
          setState({
            message:
              error instanceof Error ? error.message : "WebGPU movement backend failed",
            status: "error",
          });
        }
      });

    return () => {
      cancelled = true;
      device?.destroy();
    };
  }, []);

  return state;
}
