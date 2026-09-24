import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  type Color,
  type Material,
} from "three";

type BoxFaces = {
  sides: boolean;
  top: boolean;
  /** Metres -> texture units, for tiled facades. Without it UVs span 0..1. */
  uv?: { u: number; v: number };
};

/** Accumulates axis-aligned boxes (render space) into one geometry. */
export class BoxBatch {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];

  box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    color: Color,
    faces: BoxFaces,
  ) {
    const quad = (
      a: number[],
      b: number[],
      c: number[],
      d: number[],
      normal: number[],
      span: number,
      tiled: boolean,
    ) => {
      const u = tiled && faces.uv ? span * faces.uv.u : 1;
      const v = tiled && faces.uv ? (z1 - z0) * faces.uv.v : 1;
      const corners = [a, b, c, d];
      const uv = [
        [0, 0],
        [u, 0],
        [u, v],
        [0, v],
      ];
      for (const index of [0, 1, 2, 0, 2, 3]) {
        this.positions.push(...corners[index]);
        this.normals.push(...normal);
        this.uvs.push(uv[index][0], uv[index][1]);
        this.colors.push(color.r, color.g, color.b);
      }
    };

    if (faces.sides) {
      quad(
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
        [1, 0, 0],
        y1 - y0,
        true,
      );
      quad(
        [x0, y1, z0],
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [-1, 0, 0],
        y1 - y0,
        true,
      );
      quad(
        [x1, y1, z0],
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [0, 1, 0],
        x1 - x0,
        true,
      );
      quad(
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
        [0, -1, 0],
        x1 - x0,
        true,
      );
    }
    if (faces.top) {
      quad(
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
        [0, 0, 1],
        x1 - x0,
        false,
      );
    }
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  toGeometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  /** The batch as a named mesh that receives shadows and, by default, casts them. */
  toMesh(material: Material, name: string, castShadow = true) {
    const mesh = new Mesh(this.toGeometry(), material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}
