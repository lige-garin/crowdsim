import { rimeaCoreScenarios } from "./benchmarkScenarios";
import type { ExperimentDefinition, ExperimentVariant } from "./experimentRunner";
import type { ValidationReport } from "./validationReport";

export type AiExperimentSuggestion = {
  experiment: ExperimentDefinition;
  hypothesis: string;
  id: string;
};

export function createAiExperimentSuggestions(
  report: ValidationReport,
): AiExperimentSuggestion[] {
  const slowScenarios = report.benchmarkResults.filter(
    (result) => result.meanSpeedMetersPerSecond < 1.2,
  );
  const lowThroughputScenarios = report.benchmarkResults.filter(
    (result) => result.throughputPerMinute < 60,
  );
  const suggestions: AiExperimentSuggestion[] = [];

  if (slowScenarios.length > 0) {
    suggestions.push(
      createSuggestion("speed-calibration", "Increase desired walking speed by 10%.", [
        { id: "baseline", name: "Baseline" },
        {
          id: "speed-plus-10",
          name: "Speed +10%",
          simulationOverrides: {
            speedMetersPerSecond: 1.47,
          },
        },
      ]),
    );
  }

  if (lowThroughputScenarios.length > 0) {
    suggestions.push(
      createSuggestion(
        "throughput-stability",
        "Run a lower demand scenario to verify whether throughput loss is demand-driven.",
        [
          { id: "baseline", name: "Baseline" },
          {
            id: "reduced-demand",
            name: "Reduced demand",
            simulationOverrides: {
              maxAgents: 300,
            },
          },
        ],
      ),
    );
  }

  return suggestions.length > 0
    ? suggestions
    : [
        createSuggestion(
          "regression-watch",
          "Keep current calibration as a regression watch.",
          [
            { id: "baseline", name: "Baseline" },
            {
              id: "stress",
              name: "Stress demand",
              simulationOverrides: {
                maxAgents: 900,
              },
            },
          ],
        ),
      ];
}

function createSuggestion(
  id: string,
  hypothesis: string,
  variants: readonly ExperimentVariant[],
): AiExperimentSuggestion {
  return {
    experiment: {
      id,
      name: hypothesis,
      replications: 3,
      scenario: rimeaCoreScenarios[0],
      variants,
    },
    hypothesis,
    id,
  };
}
