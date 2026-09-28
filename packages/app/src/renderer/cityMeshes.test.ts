import { Color, InstancedMesh, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import { BoxBatch } from "./boxBatch";
import { createCityLayout } from "../viewport/cityLayout";
import { createCityObjects } from "./cityMeshes";
import { createDistrictObjects } from "./districtMeshes";

const drawables = (objects: Object3D[]) => {
  const found: Mesh[] = [];
  for (const object of objects) {
    object.traverse((child) => {
      if (child instanceof Mesh) found.push(child);
    });
  }
  return found;
};

describe("3d city meshes", () => {
  const city = createCityObjects(defaultDemoScene);
  const meshes = drawables(city.objects);

  it("draws a whole city in a small number of draw calls", () => {
    // The old renderer spent one Mesh per window pane on a dozen boxes. Every
    // generated building now merges into shared batches; trees and lamps are
    // instanced. Keep it that way.
    expect(meshes.length).toBeLessThanOrEqual(30);
    const facadeVertices = meshes
      .filter((mesh) => mesh.name.startsWith("city-facades-"))
      .reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count, 0);
    // Four walls of six vertices for every generated building, in two meshes.
    const buildings = createCityLayout(defaultDemoScene).buildings.length;
    expect(facadeVertices).toBeGreaterThanOrEqual(buildings * 24);
  });

  it("instances street trees and lamps instead of one mesh each", () => {
    const crowns = meshes.find((mesh) => mesh.name === "city-tree-crowns");
    const lamps = meshes.find((mesh) => mesh.name === "city-lamp-heads");
    expect(crowns).toBeInstanceOf(InstancedMesh);
    expect((crowns as InstancedMesh).count).toBeGreaterThan(50);
    expect(lamps).toBeInstanceOf(InstancedMesh);
  });

  it("lights windows and lamps at night and not by day", () => {
    const lamps = meshes.find((mesh) => mesh.name === "city-lamp-heads")!;
    const glow = lamps.material as MeshStandardMaterial;
    city.setNightLevel(0);
    const day = glow.emissiveIntensity;
    city.setNightLevel(1);
    expect(glow.emissiveIntensity).toBeGreaterThan(day);
  });
});

describe("district meshes", () => {
  const meshes = drawables(createDistrictObjects(defaultDemoScene));

  it("draws the district's buildings as see-through pavilions", () => {
    // Opaque boxes here hid the shoppers the app exists to show.
    const glass = meshes.find((mesh) => mesh.name === "district-pavilion-glass")!;
    const material = glass.material as MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(0.5);
    expect(material.depthWrite).toBe(false);
  });

  it("gives every shop a floor and fittings so stores are readable", () => {
    const floors = meshes.find((mesh) => mesh.name === "district-shop-floors")!;
    // Two triangles per shop floor.
    expect(floors.geometry.getAttribute("position").count).toBe(
      defaultDemoScene.shops.length * 6,
    );
  });
});

describe("box batch", () => {
  it("winds every face outward", () => {
    const batch = new BoxBatch();
    batch.box(0, 2, 0, 3, 0, 4, new Color("#ffffff"), { sides: true, top: true });
    const geometry = batch.toGeometry();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");

    for (let tri = 0; tri < position.count; tri += 3) {
      const a = [position.getX(tri), position.getY(tri), position.getZ(tri)];
      const b = [
        position.getX(tri + 1),
        position.getY(tri + 1),
        position.getZ(tri + 1),
      ];
      const c = [
        position.getX(tri + 2),
        position.getY(tri + 2),
        position.getZ(tri + 2),
      ];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const n = [normal.getX(tri), normal.getY(tri), normal.getZ(tri)];
      expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
    }
  });

  it("tiles facade UVs by size so windows keep their scale", () => {
    const narrow = new BoxBatch();
    const wide = new BoxBatch();
    const white = new Color("#ffffff");
    const uv = { u: 0.1, v: 0.1 };
    narrow.box(0, 10, 0, 10, 0, 10, white, { sides: true, top: false, uv });
    wide.box(0, 40, 0, 10, 0, 10, white, { sides: true, top: false, uv });
    const maxU = (batch: BoxBatch) => {
      const attribute = batch.toGeometry().getAttribute("uv");
      let max = 0;
      for (let i = 0; i < attribute.count; i++) max = Math.max(max, attribute.getX(i));
      return max;
    };
    expect(maxU(wide)).toBeCloseTo(maxU(narrow) * 4, 5);
  });
});
