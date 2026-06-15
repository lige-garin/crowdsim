import { useMemo } from "react";
import { describeNeuralResidualGpuContract } from "@crowdsim/core-gpu";
import { rimeaCoreScenarios } from "./benchmarkScenarios";
import { runBenchmarkScenario } from "./benchmarkRunner";
import { useI18n } from "./i18n";
import {
  createDefaultNeuralCorrectionModel,
  createNeuralCorrectionRecommendation,
} from "./neuralCorrection";
import {
  createResidualTrainingSamples,
  trainNeuralResidualModel,
} from "./neuralResidualTraining";
import {
  calibrateSocialForceParameters,
  createNeuralCorrectionValidationReport,
} from "./socialForceCalibration";
import {
  demoTrajectoryCsv,
  deriveTrajectoryCalibrationTarget,
  parseTrajectoryDatasetCsv,
} from "./trajectoryDataset";

export function NeuralCorrectionPanel() {
  const { language } = useI18n();
  const calibration = useMemo(() => {
    const result = runBenchmarkScenario(rimeaCoreScenarios[0]);
    const dataset = parseTrajectoryDatasetCsv(demoTrajectoryCsv, {
      id: "demo-bottleneck",
      name: "Demo bottleneck trajectory",
      source: "unified-csv-adapter",
    });
    const target = deriveTrajectoryCalibrationTarget(dataset);
    const training = trainNeuralResidualModel(
      createResidualTrainingSamples(result, {
        targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
        targetThroughputPerMinute: target.targetThroughputPerMinute,
      }),
      { seedModel: createDefaultNeuralCorrectionModel() },
    );
    const model = training.model;
    const preset = calibrateSocialForceParameters(result, target);
    const validation = createNeuralCorrectionValidationReport(result, target, model);
    const recommendation = createNeuralCorrectionRecommendation(
      result,
      {
        targetMeanSpeedMetersPerSecond: target.targetMeanSpeedMetersPerSecond,
        targetThroughputPerMinute: target.targetThroughputPerMinute,
      },
      {
        model,
      },
    );
    const gpuContract = describeNeuralResidualGpuContract(model);

    return {
      dataset,
      gpuContract,
      preset,
      recommendation,
      target,
      training,
      validation,
    };
  }, []);
  const title = language === "zh" ? "神经修正层" : "Neural correction";
  const confidenceLabel = language === "zh" ? "置信度" : "confidence";
  const gateLabel =
    language === "zh" ? "默认关闭，需 M5 全绿" : "default off until M5 pass";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{calibration.recommendation.notes[0]}</p>
      <code>
        dataset {calibration.dataset.tracks.length} tracks | target{" "}
        {calibration.target.targetMeanSpeedMetersPerSecond}m/s | A{" "}
        {calibration.preset.interactionStrengthA} B{" "}
        {calibration.preset.interactionRangeB} tau{" "}
        {calibration.preset.relaxationTimeSeconds}
      </code>
      <code>
        speed x{calibration.recommendation.speedMultiplier} | throughput x
        {calibration.recommendation.throughputMultiplier} | {confidenceLabel}{" "}
        {calibration.recommendation.confidence} | model{" "}
        {calibration.recommendation.modelApplied ? "on" : "off"} | error{" "}
        {calibration.validation.baselineMeanError}→
        {calibration.validation.correctedMeanError}
      </code>
      <code>
        trained {calibration.training.sampleCount} samples | loss{" "}
        {calibration.training.initialLoss}→{calibration.training.finalLoss} | source{" "}
        {calibration.training.model.source}
      </code>
      <code>
        WGSL {calibration.gpuContract.entryPoint} | readback{" "}
        {calibration.gpuContract.outputVector} | gate {gateLabel}
      </code>
    </section>
  );
}
