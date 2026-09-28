// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): the fabricated "workload reduction %"
// (projected from hardcoded per-entity minute constants, never measured) was
// removed in P0 T2. `evaluateImageTracingFixtures`, the function that used to
// score these fixtures through the real image->geometry pipeline
// (aiImageGeometry.ts) and report what it produced, was deleted 2026-09-24
// alongside `ImageGeometryPanel.tsx`, its only caller -- it had no other
// consumer. `imageTracingFixtures` below is the real, live path: the scene
// editor's own "描图示例" button (`SceneEditor.tsx`, `sceneEditorImageOverlay.ts`).
import type { ImageGeometryDraft, ImageLineSegment } from "./aiImageGeometry";

export type ImageTracingFixture = {
  draft: ImageGeometryDraft;
  id: string;
  knownDistanceMeters: number;
  name: string;
  pixelDistance: number;
};

export const imageTracingFixtures: readonly ImageTracingFixture[] = [
  {
    draft: {
      entrances: [
        entry("mall-entry", "source", 0.91, 40, 80, 28),
        entry("mall-exit", "sink", 0.88, 360, 80, 30),
      ],
      lines: [
        line("mall-wall-a", "wall", 0.94, 20, 20, 380, 20),
        line("mall-wall-b", "wall", 0.92, 380, 20, 380, 220),
        line("mall-wall-c", "wall", 0.86, 380, 220, 20, 220),
        line("mall-counter", "count-line", 0.66, 200, 40, 200, 200),
      ],
    },
    id: "mall-plan",
    knownDistanceMeters: 40,
    name: "Mall floor plan",
    pixelDistance: 400,
  },
  {
    draft: {
      entrances: [
        entry("airport-entry", "source", 0.9, 32, 140, 36),
        entry("security-exit", "sink", 0.74, 420, 140, 26),
      ],
      lines: [
        line("queue-rail-a", "wall", 0.82, 80, 80, 360, 80),
        line("queue-rail-b", "wall", 0.79, 82, 120, 358, 120),
        line("screening-count", "count-line", 0.69, 300, 70, 300, 170),
      ],
    },
    id: "airport-security-plan",
    knownDistanceMeters: 50,
    name: "Airport security plan",
    pixelDistance: 500,
  },
  {
    draft: {
      entrances: [
        entry("clinic-entry", "source", 0.84, 48, 110, 24),
        entry("clinic-exit", "sink", 0.71, 330, 120, 24),
      ],
      lines: [
        line("clinic-wall-a", "wall", 0.89, 20, 20, 340, 20),
        line("clinic-wall-b", "wall", 0.78, 340, 20, 340, 180),
        line("clinic-wall-c", "wall", 0.76, 340, 180, 20, 180),
        line("triage-count", "count-line", 0.64, 150, 40, 150, 160),
      ],
    },
    id: "clinic-plan",
    knownDistanceMeters: 32,
    name: "Clinic outpatient plan",
    pixelDistance: 320,
  },
];

function entry(
  id: string,
  kind: "sink" | "source",
  confidence: number,
  x: number,
  y: number,
  widthPixels: number,
) {
  return {
    confidence,
    id,
    kind,
    position: { x, y },
    widthPixels,
  };
}

function line(
  id: string,
  kind: "count-line" | "wall",
  confidence: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ImageLineSegment {
  return {
    confidence,
    id,
    kind,
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
  };
}
