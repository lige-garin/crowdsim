import { describe, expect, it } from "vitest";
import { crowdBudget } from "../engine/crowdBudget";
import { industryTemplates, templateScenes } from "./industryTemplates";

describe("industry templates", () => {
  it("ships six validated industry scenes with recommended parameters", () => {
    expect(industryTemplates).toHaveLength(6);
    expect(templateScenes.map((scene) => scene.id)).toEqual(
      industryTemplates.map((template) => template.scene.id),
    );
    expect(industryTemplates.map((template) => template.id)).toEqual([
      "metro-station-hall",
      "mall-atrium",
      "performance-venue",
      "airport-security",
      "hospital-outpatient",
      "stadium-concourse",
    ]);
    expect(
      industryTemplates.every(
        (template) =>
          template.recommended.arrivalRatePerMinute > 0 &&
          template.recommended.maxAgents > 0 &&
          template.recommended.speedMetersPerSecond > 0,
      ),
    ).toBe(true);
  });

  // The card advertises `recommended.maxAgents`, and the running engine
  // hard-caps the crowd at `crowdBudget.maxAgents` — advertising more than
  // the cap would silently truncate the user's scenario (a template that
  // says "max 4500" while the engine stops spawning at 2000 is a lie with
  // a number in it). This test makes that drift impossible to reintroduce.
  it("never advertises more agents than the engine can actually run", () => {
    for (const template of industryTemplates) {
      expect(template.recommended.maxAgents).toBeLessThanOrEqual(crowdBudget.maxAgents);
    }
  });
});
