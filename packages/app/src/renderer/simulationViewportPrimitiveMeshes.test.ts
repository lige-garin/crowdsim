import { describe, expect, it } from "vitest";
import { demoScene } from "../scenes/demoScene";
import { createRenderPrimitiveMesh } from "./simulationViewportPrimitiveMeshes";

describe("createRenderPrimitiveMesh", () => {
  it("draws a marker flat on the ground, with a post in 3D", () => {
    const marker = {
      color: "#f59e0b",
      id: "entrance-in-1",
      kind: "marker" as const,
      position: { x: 20, y: 15 },
      radiusMeters: 2.5,
    };

    const in3d = createRenderPrimitiveMesh(marker, demoScene, "3d");
    const in2d = createRenderPrimitiveMesh(marker, demoScene, "2d");

    // A disc alone is invisible from any angle but straight down, which is
    // what made a placed exit look like it had not been placed at all.
    expect(in3d.children).toHaveLength(2);
    expect(in2d.children).toHaveLength(1);
    expect(in3d.position.z).toBeGreaterThan(0);
    expect(in3d.position.z).toBeLessThan(1);
  });

  it("draws a zone as a flat polygon at the scene points", () => {
    const mesh = createRenderPrimitiveMesh(
      {
        color: "#2dd4bf",
        id: "zone-z-1",
        kind: "zone" as const,
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 30 },
          { x: 10, y: 30 },
        ],
      },
      demoScene,
      "3d",
    );

    // 4 corners, triangulated: the shape is a real filled area, not a box.
    expect(mesh.children).toHaveLength(0);
    expect(mesh.position.z).toBeGreaterThan(0);
  });
});
