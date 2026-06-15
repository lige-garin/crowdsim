import { describe, expect, it } from "vitest";
import {
  createSharedArrayBufferSummary,
  runSharedArrayBufferProbe,
} from "./sharedArrayBufferProbe";

describe("sharedArrayBufferProbe", () => {
  it("verifies a cross-origin isolated SAB sync path", () => {
    const fakeRuntime = {
      Atomics: {
        load: (view: Int32Array, index: number) => view[index],
        store: (view: Int32Array, index: number, value: number) => {
          view[index] = value;
          return value;
        },
      },
      SharedArrayBuffer: ArrayBuffer,
      crossOriginIsolated: true,
    } as unknown as typeof globalThis & { crossOriginIsolated: boolean };
    const result = runSharedArrayBufferProbe(fakeRuntime);

    expect(result).toMatchObject({
      byteLength: 16,
      crossOriginIsolated: true,
      sabAvailable: true,
      status: "ready",
      value: 7,
    });
    expect(createSharedArrayBufferSummary(result)).toBe(
      "SAB ready | isolated | 16 bytes",
    );
  });

  it("falls back when cross-origin isolation is missing", () => {
    const result = runSharedArrayBufferProbe({
      ...globalThis,
      crossOriginIsolated: false,
    });

    expect(result).toMatchObject({
      crossOriginIsolated: false,
      status: "fallback",
    });
    expect(createSharedArrayBufferSummary(result)).toContain("SAB fallback");
  });
});
