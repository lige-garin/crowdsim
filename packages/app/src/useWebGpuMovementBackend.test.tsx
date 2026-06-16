import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MovementBackend } from "./movementBackend";
import { useWebGpuMovementBackend } from "./useWebGpuMovementBackend";

const movementMocks = vi.hoisted(() => ({
  compareMovementBackends: vi.fn(),
  createCpuMovementBackend: vi.fn(),
  createMovementBackendProbeFixture: vi.fn(),
  createWebGpuMovementBackend: vi.fn(),
}));

vi.mock("./movementBackend", () => ({
  compareMovementBackends: movementMocks.compareMovementBackends,
  createCpuMovementBackend: movementMocks.createCpuMovementBackend,
  createMovementBackendProbeFixture: movementMocks.createMovementBackendProbeFixture,
  createWebGpuMovementBackend: movementMocks.createWebGpuMovementBackend,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "gpu");
});

describe("useWebGpuMovementBackend", () => {
  it("reports unsupported when WebGPU is unavailable", async () => {
    const { result } = renderHook(() => useWebGpuMovementBackend());

    await waitFor(() => expect(result.current.status).toBe("unsupported"));

    expect(result.current.backend).toBeUndefined();
    expect(result.current.message).toContain("unavailable");
  });

  it("publishes an active backend after CPU/WebGPU alignment", async () => {
    const device = createDevice();
    const backend = createBackend();

    installWebGpu(device);
    movementMocks.createCpuMovementBackend.mockReturnValue({ id: "cpu-compat" });
    movementMocks.createMovementBackendProbeFixture.mockReturnValue({ fixture: true });
    movementMocks.createWebGpuMovementBackend
      .mockReturnValueOnce({ id: "webgpu-ready", mode: "ready" })
      .mockReturnValueOnce(backend);
    movementMocks.compareMovementBackends.mockResolvedValueOnce({
      matches: true,
      positionsDelta: 0,
      velocitiesDelta: 0,
    });

    const { result, unmount } = renderHook(() => useWebGpuMovementBackend());

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.backend).toBe(backend);
    expect(movementMocks.createWebGpuMovementBackend).toHaveBeenLastCalledWith(
      device,
      "active",
    );

    unmount();
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the device and reports an error when alignment fails", async () => {
    const device = createDevice();

    installWebGpu(device);
    movementMocks.createCpuMovementBackend.mockReturnValue({ id: "cpu-compat" });
    movementMocks.createMovementBackendProbeFixture.mockReturnValue({ fixture: true });
    movementMocks.createWebGpuMovementBackend.mockReturnValue({
      id: "webgpu-ready",
      mode: "ready",
    });
    movementMocks.compareMovementBackends.mockResolvedValueOnce({
      matches: false,
      positionsDelta: 0.2,
      velocitiesDelta: 0.3,
    });

    const { result } = renderHook(() => useWebGpuMovementBackend());

    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.backend).toBeUndefined();
    expect(result.current.message).toContain("mismatch");
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });
});

function createBackend(): MovementBackend {
  return {
    id: "webgpu-ready",
    mode: "active",
    step: vi.fn(),
  };
}

function createDevice() {
  return {
    destroy: vi.fn(),
  } as unknown as GPUDevice & { destroy: ReturnType<typeof vi.fn> };
}

function installWebGpu(device: GPUDevice) {
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: vi.fn().mockResolvedValue({
        requestDevice: vi.fn().mockResolvedValue(device),
      }),
    },
  });
}
