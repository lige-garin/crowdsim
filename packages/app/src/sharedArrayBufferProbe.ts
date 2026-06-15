export type SharedArrayBufferProbeResult = {
  atomicsAvailable: boolean;
  byteLength: number;
  crossOriginIsolated: boolean;
  message: string;
  sabAvailable: boolean;
  status: "fallback" | "ready";
  value: number;
};

type SharedMemoryGlobal = typeof globalThis & {
  crossOriginIsolated?: boolean;
};

export function runSharedArrayBufferProbe(
  runtime: SharedMemoryGlobal = globalThis,
): SharedArrayBufferProbeResult {
  const sabAvailable = typeof runtime.SharedArrayBuffer === "function";
  const atomicsAvailable = typeof runtime.Atomics === "object";
  const crossOriginIsolated = runtime.crossOriginIsolated === true;

  if (!sabAvailable) {
    return createFallbackProbe({
      atomicsAvailable,
      crossOriginIsolated,
      message: "SharedArrayBuffer unavailable",
      sabAvailable,
    });
  }

  if (!atomicsAvailable) {
    return createFallbackProbe({
      atomicsAvailable,
      crossOriginIsolated,
      message: "Atomics unavailable",
      sabAvailable,
    });
  }

  if (!crossOriginIsolated) {
    return createFallbackProbe({
      atomicsAvailable,
      crossOriginIsolated,
      message: "Cross-origin isolation required",
      sabAvailable,
    });
  }

  const buffer = new runtime.SharedArrayBuffer(16);
  const view = new Int32Array(buffer);

  runtime.Atomics.store(view, 0, 7);

  return {
    atomicsAvailable,
    byteLength: buffer.byteLength,
    crossOriginIsolated,
    message: "SAB sync ready",
    sabAvailable,
    status: "ready",
    value: runtime.Atomics.load(view, 0),
  };
}

export function createSharedArrayBufferSummary(probe: SharedArrayBufferProbeResult) {
  const isolation = probe.crossOriginIsolated ? "isolated" : "not-isolated";

  return probe.status === "ready"
    ? `SAB ready | ${isolation} | ${probe.byteLength} bytes`
    : `SAB fallback | ${isolation} | ${probe.message}`;
}

function createFallbackProbe({
  atomicsAvailable,
  crossOriginIsolated,
  message,
  sabAvailable,
}: Pick<
  SharedArrayBufferProbeResult,
  "atomicsAvailable" | "crossOriginIsolated" | "message" | "sabAvailable"
>): SharedArrayBufferProbeResult {
  return {
    atomicsAvailable,
    byteLength: 0,
    crossOriginIsolated,
    message,
    sabAvailable,
    status: "fallback",
    value: 0,
  };
}
