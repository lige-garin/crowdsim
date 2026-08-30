import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { calibrateImageScale, type ImageGeometryDraft } from "./aiImageGeometry";
import { AiImageOverlay } from "./AiImageOverlay";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const draft: ImageGeometryDraft = {
  entrances: [
    {
      confidence: 0.66,
      id: "maybe-exit",
      kind: "sink",
      position: { x: 80, y: 20 },
      widthPixels: 20,
    },
  ],
  lines: [
    {
      confidence: 0.92,
      id: "wall-a",
      kind: "wall",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
    {
      confidence: 0.62,
      id: "count-a",
      kind: "count-line",
      points: [
        { x: 40, y: 0 },
        { x: 40, y: 100 },
      ],
    },
  ],
};

describe("AiImageOverlay", () => {
  it("renders the traced demo layer and marks low confidence review items", () => {
    const calibration = calibrateImageScale({
      knownDistanceMeters: 10,
      pixelA: { x: 0, y: 0 },
      pixelB: { x: 100, y: 0 },
    });
    const { container } = render(
      <I18nProvider>
        <svg>
          <AiImageOverlay calibration={calibration} draft={draft} />
        </svg>
      </I18nProvider>,
    );

    expect(screen.getByLabelText("描图图层（示例）")).toBeInTheDocument();
    expect(screen.getByText("置信度 92%")).toBeInTheDocument();
    expect(screen.getAllByText(/复核/)).toHaveLength(2);
    expect(container.querySelectorAll("[data-review='required']")).toHaveLength(2);
    expect(container.querySelectorAll(".ai-image-line")).toHaveLength(2);
    expect(container.querySelectorAll(".ai-image-entrance")).toHaveLength(1);
  });
});
