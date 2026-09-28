import { describe, expect, it } from "vitest";
import { imageTracingFixtures } from "./imageTracingEvaluation";
import {
  createImportedImageOverlay,
  createTracingFixtureOverlay,
} from "./sceneEditorImageOverlay";

describe("scene editor image overlay", () => {
  it("keeps an uploaded image untraced because nothing read its pixels", () => {
    const overlay = createImportedImageOverlay("shopping-centre.png");

    expect(overlay).toEqual({
      source: { kind: "user-upload", name: "shopping-centre.png" },
      status: "not-traced",
    });
  });

  it("projects fixture geometry with the fixture's own scale calibration", () => {
    const fixture = imageTracingFixtures[0];
    const overlay = createTracingFixtureOverlay(fixture.id);

    expect(overlay?.status).toBe("traced");
    expect(overlay?.source).toEqual({
      id: fixture.id,
      kind: "tracing-fixture",
      name: fixture.name,
    });
    expect(overlay?.status === "traced" && overlay.calibration.metersPerPixel).toBe(
      fixture.knownDistanceMeters / fixture.pixelDistance,
    );
  });

  it("returns nothing for an id that has no traced draft", () => {
    expect(createTracingFixtureOverlay("user-upload-42")).toBeNull();
  });
});
