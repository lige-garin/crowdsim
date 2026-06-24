import { describe, expect, it } from "vitest";
import {
  evaluateImageTracingFixtures,
  imageTracingFixtures,
} from "./imageTracingEvaluation";

describe("image tracing evaluation", () => {
  it("runs the real geometry pipeline over three floor-plan fixtures", () => {
    const evaluation = evaluateImageTracingFixtures();

    expect(evaluation.fixtureCount).toBe(3);
    expect(evaluation.results.map((result) => result.id)).toEqual(
      imageTracingFixtures.map((fixture) => fixture.id),
    );
    expect(evaluation.results.every((result) => result.generatedEntities > 0)).toBe(
      true,
    );
    expect(evaluation.results.some((result) => result.lowConfidenceCount > 0)).toBe(
      true,
    );
  });

  it("keeps generated scene ids parseable and traceable", () => {
    const evaluation = evaluateImageTracingFixtures();

    expect(
      evaluation.results.every((result) => result.sceneId.endsWith("image-draft")),
    ).toBe(true);
  });
});
