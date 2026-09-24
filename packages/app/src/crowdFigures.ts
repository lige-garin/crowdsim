import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  type Raycaster,
  SphereGeometry,
  SRGBColorSpace,
  ConeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  figureArchetypes,
  figureLook,
  type FigureArchetype,
  type FigureLook,
} from "./crowdDemographics";
import { agentStateColor, agentStateKey, type AgentStateKey } from "./agentStateColors";
import { createContactShadows } from "./contactShadows";

/**
 * People in the 3D city: a head with hair, a torso, arms and legs that swing
 * as they walk, in five builds (men, women, children, older men and women).
 *
 * Every agent used to be one white capsule, which read as a peg, not a person.
 * The figures are procedural low-poly geometry — no model files — drawn as
 * instanced parts so two thousand people stay a handful of draw calls: one
 * mesh per archetype for bodies, heads, legs and arms, 20 in all. Limbs are
 * their own instances so they can pivot at the hip and shoulder; that is the
 * whole walk cycle.
 *
 * Everyone wears their own colours — skin, hair, top and trousers vary per
 * person — so a crowd does not look like a uniformed squad. With the behaviour
 * layer on, tops and sleeves switch to the state colour (`agentStateColors`)
 * so what people are doing can be read at a glance. Who looks like what comes from
 * `crowdDemographics` — appearance only, see the note there.
 */

/** Drawn a little larger than life so people still read from a city camera. */
const READABILITY_SCALE = 1.25;
/**
 * Beyond this distance from the camera (metres) a person is drawn as one
 * low-poly silhouette in their clothes' colour, with no limbs and no shadow:
 * at that range a walking figure is a few pixels, and the four animated parts
 * per person are most of the crowd's cost.
 */
const FIGURE_DETAIL_DISTANCE = 90;

type Build = {
  height: number;
  headRadius: number;
  hairColor: [number, number, number];
  hipHeight: number;
  hipHalfWidth: number;
  legRadius: number;
  armLength: number;
  armRadius: number;
  shoulderHalfWidth: number;
  torsoDepth: number;
  torsoLength: number;
  /** Forward lean of the upper body, radians (older people stoop a little). */
  stoop: number;
  skirt: boolean;
  bun: boolean;
  /** Peak leg swing, radians. */
  stride: number;
};

function build(
  height: number,
  options: Partial<Build> & Pick<Build, "hairColor">,
): Build {
  const headRadius = options.headRadius ?? height * 0.066;
  return {
    armLength: height * 0.36,
    armRadius: height * 0.028,
    bun: false,
    headRadius,
    height,
    hipHalfWidth: height * 0.055,
    hipHeight: height * 0.47,
    legRadius: height * 0.042,
    shoulderHalfWidth: height * 0.12,
    skirt: false,
    stoop: 0,
    stride: 0.42,
    torsoDepth: height * 0.12,
    torsoLength: height * 0.3,
    ...options,
  };
}

export const figureBuilds: Record<FigureArchetype, Build> = {
  man: build(1.78, { hairColor: [0.14, 0.1, 0.08] }),
  woman: build(1.65, {
    bun: true,
    hairColor: [0.22, 0.14, 0.09],
    shoulderHalfWidth: 1.65 * 0.105,
    skirt: true,
  }),
  child: build(1.2, {
    // Children have proportionally bigger heads and shorter legs.
    headRadius: 1.2 * 0.085,
    hairColor: [0.2, 0.13, 0.08],
    hipHeight: 1.2 * 0.44,
    stride: 0.5,
  }),
  elderMan: build(1.72, {
    hairColor: [0.78, 0.78, 0.76],
    stoop: 0.16,
    stride: 0.26,
  }),
  elderWoman: build(1.58, {
    bun: true,
    hairColor: [0.84, 0.83, 0.82],
    shoulderHalfWidth: 1.58 * 0.1,
    skirt: true,
    stoop: 0.18,
    stride: 0.24,
  }),
};

const white: [number, number, number] = [1, 1, 1];
const shoe: [number, number, number] = [0.12, 0.1, 0.09];

/** Paint every vertex one colour so parts can be merged with vertex colours. */
function painted(geometry: BufferGeometry, rgb: [number, number, number]) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const count = flat.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const color = new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
  flat.deleteAttribute("uv");
  return flat;
}

/** A capsule standing along z, `length` tall overall, bottom at z = 0. */
function upright(radius: number, length: number) {
  return new CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 3, 8)
    .rotateX(Math.PI / 2)
    .translate(0, 0, length / 2);
}

/** Where the shoulders sit, in the figure's local frame, after the stoop. */
function shoulderPoint(b: Build) {
  return {
    x: Math.sin(b.stoop) * b.torsoLength,
    z: b.hipHeight + Math.cos(b.stoop) * b.torsoLength * 0.92,
  };
}

/**
 * Part geometries in the figure's local frame: x forward, y left, z up, feet
 * on z = 0. Legs and arms hang from their pivot at the origin.
 */
export function createFigureGeometry(b: Build) {
  const lean = (geometry: BufferGeometry) =>
    geometry
      .translate(0, 0, -b.hipHeight)
      .rotateY(b.stoop)
      .translate(0, 0, b.hipHeight);

  const torso = upright(b.torsoDepth / 2, b.torsoLength)
    .scale(1, (b.shoulderHalfWidth * 2) / b.torsoDepth, 1)
    .translate(0, 0, b.hipHeight - b.torsoDepth * 0.25);
  const bodyParts = [painted(lean(torso), white)];
  if (b.skirt) {
    const skirtLength = b.hipHeight * 0.42;
    const skirt = new ConeGeometry(b.hipHalfWidth * 2.3, skirtLength, 10, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, b.hipHeight + b.torsoDepth * 0.1 - skirtLength / 2);
    bodyParts.push(painted(skirt, white));
  }
  // `mergeGeometries` returns null only for an empty input or a set of
  // geometries with mismatched attributes; every call in this file passes a
  // fixed, non-empty, consistently-built array, so it's never null here or
  // at this function's other four call sites below.
  const body = mergeGeometries(bodyParts)!;

  const shoulders = shoulderPoint(b);
  const neck = b.headRadius * 0.35;
  const headCentre = {
    x: shoulders.x + Math.sin(b.stoop) * (neck + b.headRadius),
    z: shoulders.z + neck + b.headRadius,
  };
  const skull = new SphereGeometry(b.headRadius, 12, 9).translate(
    headCentre.x,
    0,
    headCentre.z,
  );
  // A cap over the back and crown of the skull.
  const hair = new SphereGeometry(
    b.headRadius * 1.07,
    12,
    7,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.55,
  )
    .rotateX(Math.PI / 2)
    .rotateY(-0.35)
    .translate(
      headCentre.x - b.headRadius * 0.06,
      0,
      headCentre.z + b.headRadius * 0.05,
    );
  const headParts = [painted(skull, white), painted(hair, b.hairColor)];
  if (b.bun) {
    const bun = new SphereGeometry(b.headRadius * 0.45, 8, 6).translate(
      headCentre.x - b.headRadius * 0.95,
      0,
      headCentre.z + b.headRadius * 0.2,
    );
    headParts.push(painted(bun, b.hairColor));
  }
  const head = mergeGeometries(headParts)!;

  const legLength = b.hipHeight + b.legRadius * 0.4;
  const legBone = upright(b.legRadius, legLength).translate(0, 0, -legLength);
  const foot = new SphereGeometry(b.legRadius * 1.15, 8, 5)
    .scale(1.7, 1, 0.7)
    .translate(b.legRadius * 0.9, 0, -legLength + b.legRadius * 0.5);
  const leg = mergeGeometries([painted(legBone, white), painted(foot, shoe)])!;

  const armBone = upright(b.armRadius, b.armLength).translate(0, 0, -b.armLength);
  const hand = new SphereGeometry(b.armRadius * 1.3, 8, 5).translate(
    0,
    0,
    -b.armLength - b.armRadius * 0.6,
  );
  const arm = mergeGeometries([
    painted(armBone, white),
    painted(hand, [0.93, 0.8, 0.7]),
  ])!;

  return { arm, body, head, leg };
}

/** The far-away figure: one capsule body and a head, a handful of triangles. */
function createFarFigureGeometry(b: Build) {
  const bodyHeight = b.hipHeight + b.torsoLength * 0.95;
  const body = upright(b.shoulderHalfWidth * 0.9, bodyHeight);
  const head = new SphereGeometry(b.headRadius * 1.05, 6, 4).translate(
    0,
    0,
    bodyHeight + b.headRadius * 1.1,
  );
  return mergeGeometries([painted(body, white), painted(head, white)])!;
}

type ArchetypeMeshes = {
  arms: InstancedMesh;
  bodies: InstancedMesh;
  build: Build;
  far: InstancedMesh;
  /** Agent id drawn at each far-figure instance index. */
  farOwners: Int32Array;
  heads: InstancedMesh;
  legs: InstancedMesh;
  /** Agent id drawn at each body/head instance index. */
  owners: Int32Array;
};

type Motion = {
  heading: number;
  phase: number;
  seenAt: number;
  swing: number;
  x: number;
  y: number;
};

export type CrowdFigureAgent = {
  behaviorState?: number;
  id: number;
  lifecycleState?: string;
  vx?: number;
  vy?: number;
  x: number;
  y: number;
};

/**
 * @param capacity people per archetype. Every agent could share one archetype,
 *   so this is the whole crowd budget, not a share of it.
 */
export function createCrowdFigures(capacity: number) {
  const group = new Group();
  group.name = "crowd-figures";
  const material = new MeshStandardMaterial({
    emissive: "#ffffff",
    // Just enough to keep people readable after dark without washing out colour.
    emissiveIntensity: 0.06,
    roughness: 0.72,
    vertexColors: true,
  });
  const geometries: BufferGeometry[] = [];
  const meshes = new Map<FigureArchetype, ArchetypeMeshes>();

  const instanced = (geometry: BufferGeometry, count: number, name: string) => {
    geometries.push(geometry);
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    group.add(mesh);
    return mesh;
  };

  for (const archetype of figureArchetypes) {
    const b = figureBuilds[archetype];
    const parts = createFigureGeometry(b);
    const bodies = instanced(parts.body, capacity, `figure-${archetype}-bodies`);
    const heads = instanced(parts.head, capacity, `figure-${archetype}-heads`);
    const legs = instanced(parts.leg, capacity * 2, `figure-${archetype}-legs`);
    const arms = instanced(parts.arm, capacity * 2, `figure-${archetype}-arms`);
    const far = instanced(
      createFarFigureGeometry(b),
      capacity,
      `figure-${archetype}-far`,
    );
    bodies.castShadow = true;
    heads.castShadow = true;
    legs.castShadow = true;
    meshes.set(archetype, {
      arms,
      bodies,
      build: b,
      far,
      farOwners: new Int32Array(capacity),
      heads,
      legs,
      owners: new Int32Array(capacity),
    });
  }

  // Null where there is no 2D canvas (tests): people just have no blob shadow.
  const contactShadows = createContactShadows(capacity);
  if (contactShadows) group.add(contactShadows.mesh);

  const stateColors = Object.fromEntries(
    Object.entries(agentStateColor).map(([key, hex]) => [key, new Color(hex)]),
  ) as Record<AgentStateKey, Color>;
  const looks = new Map<
    number,
    FigureLook & { legColor: Color; skinColor: Color; topColor: Color }
  >();
  let looksSeed = Number.NaN;
  const motion = new Map<number, Motion>();
  let frame = 0;

  const base = new Matrix4();
  const limb = new Matrix4();
  const local = new Matrix4();
  const swingRotation = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 0, 1);

  function lookFor(id: number, seed: number) {
    if (seed !== looksSeed) {
      looks.clear();
      looksSeed = seed;
    }
    let look = looks.get(id);
    if (!look) {
      const described = figureLook(id, seed);
      look = {
        ...described,
        legColor: new Color().setRGB(...described.legs, SRGBColorSpace),
        skinColor: new Color().setRGB(...described.skin, SRGBColorSpace),
        topColor: new Color().setRGB(...described.top, SRGBColorSpace),
      };
      looks.set(id, look);
    }
    return look;
  }

  function update(
    agents: readonly CrowdFigureAgent[],
    world: { height: number; width: number },
    seed: number,
    options: {
      colourByBehaviour?: boolean;
      /** Camera position in render space, for level of detail. */
      camera?: { x: number; y: number; z: number };
    } = {},
  ) {
    frame++;
    contactShadows?.begin();
    const counts = new Map<FigureArchetype, number>(
      figureArchetypes.map((a) => [a, 0]),
    );
    const farCounts = new Map<FigureArchetype, number>(
      figureArchetypes.map((a) => [a, 0]),
    );
    const detailSq = FIGURE_DETAIL_DISTANCE * FIGURE_DETAIL_DISTANCE;

    for (const agent of agents) {
      const look = lookFor(agent.id, seed);
      const set = meshes.get(look.archetype)!;
      const b = set.build;
      const renderX = agent.x - world.width / 2;
      const renderY = world.height / 2 - agent.y;
      const camera = options.camera;
      const isFar =
        camera !== undefined &&
        (renderX - camera.x) ** 2 + (renderY - camera.y) ** 2 + camera.z ** 2 >
          detailSq;
      const tally = isFar ? farCounts : counts;
      const index = tally.get(look.archetype)!;
      if (index >= capacity) continue;
      tally.set(look.archetype, index + 1);
      const previous = motion.get(agent.id);
      // Render y points the other way from scene y.
      const vx = agent.vx ?? 0;
      const vy = agent.vy ?? 0;
      const speed = Math.hypot(vx, vy);
      const moving = speed > 0.12;
      const state = previous ?? {
        heading: Math.atan2(-vy, vx),
        phase: look.stridePhase,
        seenAt: frame,
        swing: 0,
        x: renderX,
        y: renderY,
      };
      if (moving) {
        const target = Math.atan2(-vy, vx);
        let delta = target - state.heading;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        state.heading += delta * 0.3;
      }
      const travelled = Math.hypot(renderX - state.x, renderY - state.y);
      // One full leg cycle per two steps; a step is ~0.4 of body height.
      state.phase += (travelled / (b.height * 0.8 * look.heightScale)) * Math.PI * 2;
      state.swing += ((moving ? b.stride : 0) - state.swing) * 0.2;
      state.x = renderX;
      state.y = renderY;
      state.seenAt = frame;
      motion.set(agent.id, state);

      const size = READABILITY_SCALE * look.heightScale;
      const gait = b.stride > 0 ? state.swing / b.stride : 0;
      // Walking: the body rises and dips twice per stride. Standing: a slow
      // shift of weight, so a waiting crowd is not a row of statues.
      const bob = Math.abs(Math.sin(state.phase)) * b.height * 0.018 * gait * size;
      const sway = (1 - gait) * Math.sin(frame * 0.015 + look.stridePhase * 7) * 0.05;
      position.set(renderX, renderY, bob);
      rotation.setFromAxisAngle(up, state.heading + sway);
      scale.set(size, size, size);
      base.compose(position, rotation, scale);
      contactShadows?.add(renderX, renderY, state.heading, size);

      const shirt = options.colourByBehaviour
        ? stateColors[agentStateKey(agent)]
        : look.topColor;
      if (isFar) {
        set.farOwners[index] = agent.id;
        set.far.setMatrixAt(index, base);
        set.far.setColorAt(index, shirt);
        continue;
      }

      // Own clothes by default; the behaviour layer recolours them by state.
      set.owners[index] = agent.id;
      set.bodies.setMatrixAt(index, base);
      set.bodies.setColorAt(index, shirt);
      set.heads.setMatrixAt(index, base);
      set.heads.setColorAt(index, look.skinColor);

      const swing = Math.sin(state.phase) * state.swing;
      const shoulders = shoulderPoint(b);
      for (let side = 0; side < 2; side++) {
        const lateral = side === 0 ? 1 : -1;
        const legIndex = index * 2 + side;
        local.makeTranslation(0, lateral * b.hipHalfWidth, b.hipHeight);
        swingRotation.makeRotationY(lateral * swing);
        limb.copy(base).multiply(local).multiply(swingRotation);
        set.legs.setMatrixAt(legIndex, limb);
        set.legs.setColorAt(legIndex, look.legColor);

        local.makeTranslation(
          shoulders.x,
          lateral * (b.shoulderHalfWidth + b.armRadius),
          shoulders.z,
        );
        // Arms swing against the leg on their side.
        swingRotation.makeRotationY(-lateral * swing * 0.8);
        limb.copy(base).multiply(local).multiply(swingRotation);
        set.arms.setMatrixAt(legIndex, limb);
        set.arms.setColorAt(legIndex, shirt);
      }
    }

    for (const [archetype, set] of meshes) {
      const count = counts.get(archetype)!;
      const farCount = farCounts.get(archetype)!;
      for (const [mesh, instances] of [
        [set.bodies, count],
        [set.heads, count],
        [set.legs, count * 2],
        [set.arms, count * 2],
        [set.far, farCount],
      ] as const) {
        const touched = Math.max(instances, mesh.count);
        mesh.count = instances;
        if (touched > 0) {
          mesh.instanceMatrix.clearUpdateRanges();
          mesh.instanceMatrix.addUpdateRange(0, touched * 16);
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) {
            mesh.instanceColor.clearUpdateRanges();
            mesh.instanceColor.addUpdateRange(0, touched * 3);
            mesh.instanceColor.needsUpdate = true;
          }
        }
      }
    }

    contactShadows?.end();

    // Forget people who have left, now and then.
    if (frame % 240 === 0) {
      for (const [id, state] of motion) {
        if (frame - state.seenAt > 240) motion.delete(id);
      }
      if (looks.size > capacity * 4) looks.clear();
    }
  }

  /** The id of the person under a ray, or null. */
  function pick(raycaster: Raycaster): number | null {
    let best: { distance: number; id: number } | null = null;
    for (const set of meshes.values()) {
      for (const [mesh, owners] of [
        [set.bodies, set.owners],
        [set.heads, set.owners],
        [set.far, set.farOwners],
      ] as const) {
        if (mesh.count === 0) continue;
        mesh.computeBoundingSphere();
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (hit?.instanceId != null && (!best || hit.distance < best.distance)) {
          best = { distance: hit.distance, id: owners[hit.instanceId] };
        }
      }
    }
    return best?.id ?? null;
  }

  function dispose() {
    group.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    material.dispose();
    contactShadows?.dispose();
    for (const set of meshes.values()) {
      [set.bodies, set.heads, set.legs, set.arms, set.far].forEach((mesh) =>
        mesh.dispose(),
      );
    }
  }

  return { dispose, group, pick, update };
}
