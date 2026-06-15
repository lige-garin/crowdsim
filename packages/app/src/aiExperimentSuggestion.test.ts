import { describe, expect, it } from "vitest";
import { createAiExperimentSuggestions } from "./aiExperimentSuggestion";
import { createValidationReport } from "./validationReport";

describe("AI experiment suggestions", () => {
  it("turns validation report observations into experiment definitions", () => {
    const report = createValidationReport({
      generatedAtIso: "2026-06-12T00:00:00.000Z",
    });
    const suggestions = createAiExperimentSuggestions(report);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].experiment.replications).toBe(3);
    expect(suggestions[0].experiment.variants.length).toBeGreaterThanOrEqual(2);
    expect(suggestions[0].experiment.scenario.id).toBe("rimea-straight-corridor");
  });
});
