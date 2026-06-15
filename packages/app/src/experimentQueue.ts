import { runBenchmarkScenario } from "./benchmarkRunner";
import type { ExperimentDefinition, ExperimentRunResult } from "./experimentRunner";

export type ExperimentQueueProgress = {
  completed: number;
  total: number;
};

export async function runExperimentQueue(
  experiment: ExperimentDefinition,
  options: {
    onProgress?: (progress: ExperimentQueueProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExperimentRunResult[]> {
  const total = Math.max(1, experiment.replications) * experiment.variants.length;
  const results: ExperimentRunResult[] = [];
  let completed = 0;

  for (const variant of experiment.variants) {
    for (
      let replicationIndex = 0;
      replicationIndex < Math.max(1, experiment.replications);
      replicationIndex++
    ) {
      if (options.signal?.aborted) {
        throw new Error("Experiment queue aborted");
      }

      const seed =
        experiment.scenario.scene.seed + (variant.seedOffset ?? 0) + replicationIndex;
      const scenario = {
        ...experiment.scenario,
        id: `${experiment.scenario.id}__${variant.id}__${replicationIndex}`,
        name: `${experiment.scenario.name} / ${variant.name} #${replicationIndex + 1}`,
        scene: {
          ...(variant.scene ?? experiment.scenario.scene),
          seed,
        },
        simulation: {
          ...experiment.scenario.simulation,
          ...variant.simulationOverrides,
          seed,
        },
      };

      results.push({
        benchmark: runBenchmarkScenario(scenario),
        experimentId: experiment.id,
        replicationIndex,
        variantId: variant.id,
        variantName: variant.name,
      });
      completed++;
      options.onProgress?.({ completed, total });
      await Promise.resolve();
    }
  }

  return results;
}
