import {
  Box3,
  Color,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector3,
  type InstancedMesh,
} from "three";
import { describe, expect, it } from "vitest";
import {
  figureArchetypes,
  figureLook,
  figureMix,
  type FigureArchetype,
} from "./crowdDemographics";
import {
  createCrowdFigures,
  createFigureGeometry,
  figureBuilds,
  type CrowdFigureAgent,
} from "./crowdFigures";

const world = { height: 100, width: 100 };

describe("crowd demographics", () => {
  it("gives the same person the same look every time", () => {
    expect(figureLook(42, 7)).toEqual(figureLook(42, 7));
  });

  it("draws the crowd in the declared mix", () => {
    const counts = Object.fromEntries(figureArchetypes.map((a) => [a, 0])) as Record<
      FigureArchetype,
      number
    >;
    const people = 20_000;
    for (let id = 1; id <= people; id++) counts[figureLook(id, 3).archetype]++;
    for (const archetype of figureArchetypes) {
      expect(counts[archetype] / people).toBeCloseTo(figureMix[archetype], 1);
    }
    const total = Object.values(figureMix).reduce((sum, share) => sum + share, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe("figure geometry", () => {
  const top = (archetype: FigureArchetype) => {
    const parts = createFigureGeometry(figureBuilds[archetype]);
    return new Box3().setFromBufferAttribute(
      parts.head.getAttribute("position") as never,
    ).max.z;
  };

  it("is as tall as the build says, head to foot", () => {
    for (const archetype of figureArchetypes) {
      const b = figureBuilds[archetype];
      const parts = createFigureGeometry(b);
      const leg = new Box3().setFromBufferAttribute(
        parts.leg.getAttribute("position") as never,
      );
      // Legs hang from the hip pivot; the sole lands on the ground.
      expect(leg.min.z + b.hipHeight).toBeCloseTo(0, 1);
      expect(top(archetype)).toBeGreaterThan(b.height * 0.88);
      expect(top(archetype)).toBeLessThan(b.height * 1.08);
    }
  });

  it("makes children smallest and men tallest", () => {
    expect(top("child")).toBeLessThan(top("elderWoman"));
    expect(top("elderWoman")).toBeLessThan(top("woman"));
    expect(top("woman")).toBeLessThan(top("man"));
  });

  it("paints hair and shoes, not one flat colour", () => {
    const parts = createFigureGeometry(figureBuilds.elderMan);
    const colors = parts.head.getAttribute("color");
    const distinct = new Set<string>();
    for (let i = 0; i < colors.count; i++) distinct.add(colors.getX(i).toFixed(3));
    expect(distinct.size).toBeGreaterThan(1);
  });
});

function meshesOf(figures: ReturnType<typeof createCrowdFigures>) {
  const byName = new Map<string, InstancedMesh>();
  figures.group.children.forEach((child) =>
    byName.set(child.name, child as InstancedMesh),
  );
  return byName;
}

function personOf(id: number, seed: number) {
  return figureLook(id, seed).archetype;
}

describe("crowd figures", () => {
  it("draws one body and head, two legs and two arms per person", () => {
    const figures = createCrowdFigures(64);
    const agents: CrowdFigureAgent[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      vx: 1,
      vy: 0,
      x: 10 + i,
      y: 50,
    }));
    figures.update(agents, world, 5);
    const meshes = meshesOf(figures);
    let bodies = 0;
    for (const archetype of figureArchetypes) {
      const count = meshes.get(`figure-${archetype}-bodies`)!.count;
      bodies += count;
      expect(meshes.get(`figure-${archetype}-heads`)!.count).toBe(count);
      expect(meshes.get(`figure-${archetype}-legs`)!.count).toBe(count * 2);
      expect(meshes.get(`figure-${archetype}-arms`)!.count).toBe(count * 2);
    }
    expect(bodies).toBe(30);
    figures.dispose();
  });

  it("swings the legs of a walker and keeps a standing person's legs still", () => {
    const seed = 11;
    const walkerId = 1;
    const standerId = [...Array(200).keys()]
      .map((i) => i + 2)
      .find((id) => personOf(id, seed) === personOf(walkerId, seed))!;
    const figures = createCrowdFigures(8);
    const legs = meshesOf(figures).get(`figure-${personOf(walkerId, seed)}-legs`)!;
    const legMatrix = (index: number) => {
      const m = new Matrix4();
      legs.getMatrixAt(index, m);
      return m;
    };
    const swingOf = (index: number) => {
      const rotation = new Quaternion();
      legMatrix(index).decompose(new Vector3(), rotation, new Vector3());
      // Rotation away from upright (the leg's local z axis).
      return new Vector3(0, 0, 1)
        .applyQuaternion(rotation)
        .angleTo(new Vector3(0, 0, 1));
    };

    let maxWalkerSwing = 0;
    let maxStanderSwing = 0;
    for (let step = 0; step < 40; step++) {
      figures.update(
        [
          { id: walkerId, vx: 1.3, vy: 0, x: 20 + step * 0.1, y: 50 },
          { id: standerId, vx: 0, vy: 0, x: 60, y: 50 },
        ],
        world,
        seed,
      );
      maxWalkerSwing = Math.max(maxWalkerSwing, swingOf(0), swingOf(1));
      maxStanderSwing = Math.max(maxStanderSwing, swingOf(2), swingOf(3));
    }
    expect(maxWalkerSwing).toBeGreaterThan(0.15);
    expect(maxStanderSwing).toBeLessThan(0.01);
    figures.dispose();
  });

  it("faces the way the person walks", () => {
    const seed = 2;
    const id = 5;
    const figures = createCrowdFigures(4);
    const bodies = meshesOf(figures).get(`figure-${personOf(id, seed)}-bodies`)!;
    const facing = () => {
      const m = new Matrix4();
      bodies.getMatrixAt(0, m);
      return new Vector3(1, 0, 0).transformDirection(m);
    };
    // Scene +y is render -y.
    for (let i = 0; i < 30; i++) {
      figures.update([{ id, vx: 0, vy: 1.2, x: 50, y: 50 + i * 0.05 }], world, seed);
    }
    expect(facing().y).toBeLessThan(-0.95);
    figures.dispose();
  });

  it("picks the person under the cursor", () => {
    const seed = 9;
    const figures = createCrowdFigures(4);
    figures.update([{ id: 77, vx: 0, vy: 0, x: 50, y: 50 }], world, seed);
    figures.group.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(0, 0, 30), new Vector3(0, 0, -1));
    expect(figures.pick(raycaster)).toBe(77);
    const miss = new Raycaster(new Vector3(20, 20, 30), new Vector3(0, 0, -1));
    expect(figures.pick(miss)).toBeNull();
    figures.dispose();
  });

  it("dresses people in their own colours unless behaviour colouring is on", () => {
    const seed = 4;
    const walkers = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      lifecycleState: "walk",
      vx: 1,
      vy: 0,
      x: 10 + i,
      y: 50,
    }));
    const topsOf = (colourByBehaviour: boolean) => {
      const figures = createCrowdFigures(64);
      figures.update(walkers, world, seed, { colourByBehaviour });
      const tops = new Set<string>();
      const colour = new Color();
      for (const archetype of figureArchetypes) {
        const bodies = meshesOf(figures).get(`figure-${archetype}-bodies`)!;
        for (let i = 0; i < bodies.count; i++) {
          bodies.getColorAt(i, colour);
          tops.add(colour.getHexString());
        }
      }
      figures.dispose();
      return tops;
    };
    // Everyone walking: one state colour when colouring by behaviour...
    expect(topsOf(true).size).toBe(1);
    // ...and a varied crowd otherwise.
    expect(topsOf(false).size).toBeGreaterThan(5);
  });
});

describe("crowd level of detail", () => {
  it("draws far-away people as one silhouette each, and they can still be picked", () => {
    const figures = createCrowdFigures(16);
    // Render centre is (0, 0) for this 100 × 100 world; the camera sits above
    // scene (50, 50). One person under it, one 300 m away along x.
    const camera = { x: 0, y: 0, z: 40 };
    figures.update(
      [
        { id: 1, vx: 0, vy: 0, x: 50, y: 50 },
        { id: 2, vx: 0, vy: 0, x: 350, y: 50 },
      ],
      world,
      3,
      { camera },
    );
    const meshes = meshesOf(figures);
    const sum = (part: string) =>
      figureArchetypes.reduce(
        (total, archetype) => total + meshes.get(`figure-${archetype}-${part}`)!.count,
        0,
      );

    expect(sum("bodies")).toBe(1);
    expect(sum("legs")).toBe(2);
    expect(sum("far")).toBe(1);

    figures.group.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(300, 0, 30), new Vector3(0, 0, -1));
    expect(figures.pick(raycaster)).toBe(2);
    figures.dispose();
  });
});
