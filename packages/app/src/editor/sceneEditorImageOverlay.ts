// The editor runs no image->geometry recognition in the browser:
// `aiImageGeometry` only projects an already-produced draft into scene
// coordinates, and the only drafts that exist are the hand-written fixtures in
// `imageTracingEvaluation`. Painting a fixture over whatever the user uploaded
// would present a fictional mall's walls as a recognition result for their
// floor plan, so an upload can only ever reach the `not-traced` state and the
// fixture geometry is reachable only through the explicit demo entry.
import {
  calibrateImageScale,
  type ImageGeometryDraft,
  type ImageScaleCalibration,
} from "./aiImageGeometry";
import { imageTracingFixtures } from "./imageTracingEvaluation";

export type SceneImageOverlaySource =
  | { id: string; kind: "tracing-fixture"; name: string }
  | { kind: "user-upload"; name: string };

export type SceneImageOverlay =
  | {
      calibration: ImageScaleCalibration;
      draft: ImageGeometryDraft;
      source: SceneImageOverlaySource;
      status: "traced";
    }
  | {
      source: SceneImageOverlaySource;
      status: "not-traced";
    };

export function createImportedImageOverlay(name: string): SceneImageOverlay {
  return {
    source: { kind: "user-upload", name },
    status: "not-traced",
  };
}

export function createTracingFixtureOverlay(
  fixtureId: string,
): SceneImageOverlay | null {
  const fixture = imageTracingFixtures.find((candidate) => candidate.id === fixtureId);

  if (!fixture) {
    return null;
  }

  return {
    calibration: calibrateImageScale({
      knownDistanceMeters: fixture.knownDistanceMeters,
      pixelA: { x: 0, y: 0 },
      pixelB: { x: fixture.pixelDistance, y: 0 },
    }),
    draft: fixture.draft,
    source: { id: fixture.id, kind: "tracing-fixture", name: fixture.name },
    status: "traced",
  };
}
