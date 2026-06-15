import { describe, expect, it } from "vitest";
import {
  createNeuralResidualFeatureBufferData,
  createNeuralResidualWeightBufferData,
  describeNeuralResidualGpuContract,
  inferNeuralResidualBatchCpu,
  inferNeuralResidualBatchGpu,
  type NeuralResidualGpuFeature,
  type NeuralResidualGpuModel,
} from "./index";

const model: NeuralResidualGpuModel = {
  enabled: true,
  hiddenBias: [0.02, -0.01, 0.04],
  hiddenWeights: [
    [0.35, -0.18, 0.12, 0.08],
    [-0.16, 0.28, 0.06, -0.04],
    [0.1, 0.12, -0.2, 0.18],
  ],
  outputBias: [0, 0],
  outputWeights: [
    [0.08, -0.04, 0.03],
    [-0.02, 0.07, 0.04],
  ],
  source: "calibration-fixture",
};

const features: NeuralResidualGpuFeature[] = [
  {
    densityPeak: 0.45,
    remainingRatio: 0.12,
    signedSpeedError: 0.08,
    signedThroughputError: -0.05,
  },
  {
    densityPeak: 0.8,
    remainingRatio: 0.2,
    signedSpeedError: -0.16,
    signedThroughputError: 0.14,
  },
];

describe("neural residual gpu contract", () => {
  it("packs 4-3-2 MLP features and coefficients for WGSL", () => {
    const contract = describeNeuralResidualGpuContract(model);
    const featureData = createNeuralResidualFeatureBufferData(features);
    const weightData = createNeuralResidualWeightBufferData(model);

    expect(contract).toMatchObject({
      defaultEnabled: false,
      entryPoint: "infer_neural_residual",
      requiresBenchmarkGate: true,
      shaderLabel: "neural-residual-shader",
      workgroupSize: 64,
    });
    expect(Array.from(featureData.slice(0, 4))).toEqual([
      expect.closeTo(0.08, 5),
      expect.closeTo(-0.05, 5),
      expect.closeTo(0.45, 5),
      expect.closeTo(0.12, 5),
    ]);
    expect(weightData).toHaveLength(28);
    expect(weightData[23]).toBeCloseTo(0.12);
  });

  it("keeps CPU residuals bounded and disabled by model flag", () => {
    const enabled = inferNeuralResidualBatchCpu(features, model);
    const disabled = inferNeuralResidualBatchCpu(features, {
      ...model,
      enabled: false,
    });

    expect(Math.abs(enabled[0])).toBeLessThanOrEqual(0.12);
    expect(Math.abs(enabled[1])).toBeLessThanOrEqual(0.12);
    expect(Array.from(disabled)).toEqual([0, 0, 0, 0]);
  });

  const maybeNavigator = globalThis.navigator as
    | (Navigator & { gpu?: GPU })
    | undefined;
  const gpuTest = maybeNavigator?.gpu ? it : it.skip;

  gpuTest("matches CPU readback when WebGPU is available", async () => {
    const adapter = await maybeNavigator?.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    expect(device).toBeDefined();

    const expected = inferNeuralResidualBatchCpu(features, model);
    const actual = await inferNeuralResidualBatchGpu(device!, features, model);

    expect(Array.from(actual)).toEqual(
      Array.from(expected).map((value) => expect.closeTo(value, 5)),
    );

    device!.destroy();
  });
});
