import { describe, expect, it } from "vitest";
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
});
