import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import {
  calibrateImageScale,
  createSceneFromImageGeometry,
  findLowConfidenceGeometry,
  imagePointToScenePoint,
  mergeNearbyLineSegments,
  type ImageGeometryDraft,
} from "./aiImageGeometry";

describe("AI image geometry pipeline", () => {
  it("calibrates image pixels into scene meters", () => {
    const calibration = calibrateImageScale({
      knownDistanceMeters: 10,
      pixelA: { x: 100, y: 100 },
      pixelB: { x: 200, y: 100 },
    });

    expect(calibration.metersPerPixel).toBe(0.1);
    expect(imagePointToScenePoint({ x: 150, y: 120 }, calibration)).toEqual({
      x: 5,
      y: 2,
    });
  });

  it("creates a scene draft with walls, entrances, and count lines", () => {
    const calibration = calibrateImageScale({
      knownDistanceMeters: 20,
      pixelA: { x: 0, y: 0 },
      pixelB: { x: 200, y: 0 },
    });
    const scene = createSceneFromImageGeometry(
      demoScene,
      {
        entrances: [
          {
            confidence: 0.92,
            id: "image-entry",
            kind: "source",
            position: { x: 100, y: 40 },
            widthPixels: 30,
          },
        ],
        lines: [
          {
            confidence: 0.95,
            id: "image-wall",
            kind: "wall",
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
          {
            confidence: 0.62,
            id: "image-count",
            kind: "count-line",
            points: [
              { x: 80, y: 0 },
              { x: 80, y: 100 },
            ],
          },
        ],
      },
      calibration,
    );

    expect(scene.id).toBe("atrium-demo-image-draft");
    expect(scene.walls.map((wall) => wall.id)).toContain("image-wall");
    expect(scene.entrances.map((entrance) => entrance.id)).toContain("image-entry");
    expect(scene.countLines.map((line) => line.id)).toContain("image-count");
  });

  it("flags low-confidence geometry and snaps nearby line starts", () => {
    const draft: ImageGeometryDraft = {
      entrances: [
        {
          confidence: 0.55,
          id: "maybe-exit",
          kind: "sink" as const,
          position: { x: 20, y: 20 },
          widthPixels: 12,
        },
      ],
      lines: [
        {
          confidence: 0.9,
          id: "line-a",
          kind: "wall" as const,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        },
        {
          confidence: 0.65,
          id: "line-b",
          kind: "wall" as const,
          points: [
            { x: 11, y: 0 },
            { x: 20, y: 0 },
          ],
        },
      ],
    };

    expect(findLowConfidenceGeometry(draft).map((item) => item.id)).toEqual([
      "line-b",
      "maybe-exit",
    ]);
    expect(mergeNearbyLineSegments(draft.lines, 2)[1].points[0]).toEqual({
      x: 10,
      y: 0,
    });
  });
});
