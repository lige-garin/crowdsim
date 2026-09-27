import type {
  AgentSpawn,
  GpuSimCore,
  GpuSimCoreSocialForceParams,
  GpuSlotAllocator,
  WallSegment,
} from "@crowdsim/core-gpu";
import {
  createGpuSimCore,
  createGpuSlotAllocator,
  createSpatialHashGridLayout,
} from "@crowdsim/core-gpu";
import {
  deriveFreeSpeed,
  deriveHolding,
  deriveWalkingHeading,
  type SocialForceParameters,
} from "./crowdMovement";
import type { Router } from "./crowdNavigation";
import { constrainMovement, type SceneWorldBounds } from "./sceneGeometry";
import { sampleBodyRadius, sampleSpeedFactor } from "./behaviorDistributions";
import type { SimulationAgent } from "./simulationEngine";
import { groupFormation } from "./walkingGroups";
import type { WallIndex } from "./wallIndex";

/**
 * ADR-0033 gap #5: one `GpuSimCore` instance per active plane (a real floor
 * or a flight lane, exactly the same unit `advanceAgentsCpu`'s own
 * per-plane loop already steps separately) — walls are fixed at
 * `GpuSimCore` construction, and two planes' walls almost never match, so
 * they cannot share one instance.
 */
export type GpuCrowdPlane = {
  core: GpuSimCore;
  allocator: GpuSlotAllocator;
  /** The `rawWalls`/`world` this plane's `core` was actually built from —
   * see `planeFingerprint`'s own comment for why `forPlane` needs it. */
  fingerprint: string;
};

/**
 * A cheap content key for "would `createGpuSimCore` need to be called
 * again for this geometry" — walls are fixed at `GpuSimCore` construction
 * (ADR-0033's Context section), so a scene edit that changes a floor's
 * walls has to be detected, not just a changed `planeId`.
 *
 * Reference equality does not work here: `simulationEngine.ts`'s
 * `buildFloors`/`buildFlightFloors` rebuild the entire `FloorRuntime[]`
 * fresh on every hot scene update (ADR-0007), including floors whose own
 * geometry did not change — so `rawWalls`/`world` are new array/object
 * instances on every edit regardless of which floor was actually touched.
 * Content comparison is what tells "floor 2's walls changed" apart from
 * "floor 1 got a new array with the same four numbers in it".
 *
 * Wall order is assumed stable for unchanged input (true for this
 * codebase's own deterministic `buildFloors`/`buildFlightFloors`) — a
 * hypothetical scene producing the same walls in a different order would
 * cause one needless rebuild, not an incorrect one.
 */
export function planeFingerprint(
  rawWalls: readonly WallSegment[],
  world: SceneWorldBounds,
): string {
  let key = `${world.width}x${world.height}`;
  for (const wall of rawWalls) {
    key += `|${wall.x1},${wall.y1},${wall.x2},${wall.y2}`;
  }
  return key;
}

export type GpuCrowdPlanePool = {
  /**
   * The plane for `planeId`, creating it (from `rawWalls`/`world`) the
   * first time this id is seen. On a later call whose `rawWalls`/`world`
   * content differs from what the cached plane was built with (a scene
   * edit changed that floor's geometry), the stale `core` is destroyed and
   * a fresh one built in its place, along with a fresh `allocator` --
   * every currently-walking agent on this plane will look "new" to that
   * allocator's very next `sync()`, so `advanceAgentsGpu` re-spawns each
   * one from its own CPU-resident `x`/`y`/`vx`/`vy` (already accurate --
   * every readback writes it straight back onto `SimulationAgent`), the
   * same path a plane's first-ever agents already go through. No agent
   * state is lost, only the destroyed core's now-irrelevant GPU buffers.
   */
  forPlane(
    planeId: string | undefined,
    rawWalls: WallSegment[],
    world: SceneWorldBounds,
  ): GpuCrowdPlane;
  /** Destroys and forgets every plane whose id is absent from
   * `activePlaneIds` — a floor or flight lane that no longer exists this
   * tick (a flight lane in particular is transient, built fresh some
   * ticks per `buildFlightFloors`). */
  prune(activePlaneIds: ReadonlySet<string | undefined>): void;
  destroyAll(): void;
};

export function createGpuCrowdPlanePool(
  device: GPUDevice,
  options: { capacity: number; params: GpuSimCoreSocialForceParams },
): GpuCrowdPlanePool {
  const planes = new Map<string | undefined, GpuCrowdPlane>();
  // Self-reviewed (2026-09-28): the first version of this fix recomputed
  // `planeFingerprint` -- a string built from every wall's coordinates --
  // on every single call, including the overwhelming majority where
  // nothing changed (`forPlane` runs once per active plane per movement
  // tick, `simulationEngine.ts`'s `advanceAgentsGpuTick`). `buildFloors`/
  // `buildFlightFloors` only produce a *new* `rawWalls`/`world` when a
  // scene is actually hot-updated (ADR-0007) -- between updates, the same
  // `FloorRuntime` (and so the same array/object references) is reused
  // call after call. A cheap reference check catches that common case
  // before paying for the content comparison, which only has to run on
  // the rare tick right after an edit.
  const lastInputs = new Map<
    string | undefined,
    { rawWalls: WallSegment[]; world: SceneWorldBounds }
  >();
  // The neighbourhood-restricted kernel is only lossless when cellSize
  // covers every range it needs to be exact for -- interactionRangeMeters
  // (checked by createGpuSimCore itself) AND anticipationRangeMeters AND
  // formationRoomMeters (both only checked by the CPU-oracle test helper,
  // gpuSimCoreSocialForce.ts's `stepGpuSimCoreSocialForceNeighborhoodCpu` --
  // the real kernel has no runtime check for these two, so getting this
  // wrong would silently under-count neighbours rather than throw).
  // formationRoomMeters is a WGSL constant (1m, matching crowdMovement.ts's
  // own hardcoded value), not a configurable param.
  const cellSize = Math.max(
    options.params.interactionRangeMeters,
    options.params.anticipationRangeMeters,
    1,
  );

  return {
    forPlane(planeId, rawWalls, world) {
      const existing = planes.get(planeId);
      const last = lastInputs.get(planeId);
      // Same array/object instances as last call -> definitely unchanged,
      // skip building a fingerprint at all (this is the common case).
      if (existing && last && last.rawWalls === rawWalls && last.world === world) {
        return existing;
      }
      lastInputs.set(planeId, { rawWalls, world });
      const fingerprint = planeFingerprint(rawWalls, world);
      if (existing && existing.fingerprint === fingerprint) return existing;
      if (existing) existing.core.destroy();
      const layout = createSpatialHashGridLayout({
        width: world.width,
        height: world.height,
        cellSize,
      });
      const plane: GpuCrowdPlane = {
        core: createGpuSimCore(device, {
          capacity: options.capacity,
          layout,
          walls: rawWalls,
          params: options.params,
        }),
        allocator: createGpuSlotAllocator(),
        fingerprint,
      };
      planes.set(planeId, plane);
      return plane;
    },
    prune(activePlaneIds) {
      for (const [id, plane] of [...planes]) {
        if (!activePlaneIds.has(id)) {
          plane.core.destroy();
          planes.delete(id);
          lastInputs.delete(id);
        }
      }
    },
    destroyAll() {
      for (const plane of planes.values()) plane.core.destroy();
      planes.clear();
      lastInputs.clear();
    },
  };
}

export type GpuCrowdUploadArrays = {
  targets: Float32Array;
  speed: Float32Array;
  groupIds: Int32Array;
  formationSlots: Float32Array;
  hazardAvoidance: Float32Array;
  holding: Uint32Array;
  routedHeading: Float32Array;
};

/**
 * Every full-array, per-tick GPU upload this plane's current walking
 * population needs — `targets`/`speed`/`groupIds`/`formationSlots`/
 * `hazardAvoidance`/`holding`/`routedHeading`, each slot-indexed (size
 * `count`, not `walkingAgents.length` — a caller scatters via `slots`).
 * Pure and GPU-free, so fully Node-testable without a device.
 *
 * Also resolves (and returns, parallel to `walkingAgents`) each agent's
 * `radius`/`speedFactor` the same lazy way `stepCrowd` does — `agent.radius
 * ?? sampleBodyRadius(...)` — since a caller building `AgentSpawn` entries
 * for newly spawned/relocated ids needs a resolved number, and the
 * returned `SimulationAgent[]` needs these baked in going forward exactly
 * as `stepCrowd`'s own `next.push({...agent, radius, speedFactor, ...})`
 * already does for the CPU path.
 *
 * One real, disclosed discrepancy this function has to correct for rather
 * than reproduce naively: `crowdMovement.ts`'s formation force is gated on
 * `groupFormation(agents).slots.has(agent.id)` (which excludes a holding
 * companion, or any grouped-but-not-currently-moving agent, per
 * `groupFormation`'s own `isMoving` check) — but the GPU kernel's own gate
 * is only `groupIds[i] >= 0`. Uploading an agent's real, defined `groupId`
 * whenever it lacks a formation slot would let the kernel apply a
 * formation pull CPU never would for that same agent. So `groupIds` here
 * is `-1` unless the agent BOTH has a `groupId` AND has an entry in
 * `groupFormation`'s own slot map — matching CPU's actual gate, not just
 * its most obvious-looking condition.
 */
export function buildGpuCrowdUploadArrays(
  walkingAgents: readonly SimulationAgent[],
  slots: Int32Array,
  count: number,
  meanSpeedMetersPerSecond: number,
  router: Pick<Router, "direction">,
  seed: number,
): GpuCrowdUploadArrays & { radii: Float32Array; speedFactors: Float32Array } {
  const targets = new Float32Array(count * 2);
  const speed = new Float32Array(count);
  const groupIds = new Int32Array(count).fill(-1);
  const formationSlots = new Float32Array(count * 2);
  const hazardAvoidance = new Float32Array(count * 2);
  const holding = new Uint32Array(count);
  const routedHeading = new Float32Array(count * 2);
  const radii = new Float32Array(walkingAgents.length);
  const speedFactors = new Float32Array(walkingAgents.length);

  const formation = groupFormation(walkingAgents);

  for (let i = 0; i < walkingAgents.length; i++) {
    const agent = walkingAgents[i];
    const slot = slots[i];
    const radius = agent.radius ?? sampleBodyRadius(seed, agent.id);
    const speedFactor = agent.speedFactor ?? sampleSpeedFactor(seed, agent.id);
    radii[i] = radius;
    speedFactors[i] = speedFactor;

    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.hypot(dx, dy);
    const holdingBool = deriveHolding(agent);

    targets[slot * 2] = agent.targetX;
    targets[slot * 2 + 1] = agent.targetY;
    speed[slot] = deriveFreeSpeed(agent, meanSpeedMetersPerSecond, speedFactor);
    holding[slot] = holdingBool ? 1 : 0;

    const heading = deriveWalkingHeading(agent, router, holdingBool, dx, dy, distance);
    routedHeading[slot * 2] = heading.x;
    routedHeading[slot * 2 + 1] = heading.y;

    if (agent.hazardAvoidance) {
      hazardAvoidance[slot * 2] = agent.hazardAvoidance[0];
      hazardAvoidance[slot * 2 + 1] = agent.hazardAvoidance[1];
    }

    const formationSlot = formation.slots.get(agent.id);
    if (agent.groupId !== undefined && formationSlot) {
      groupIds[slot] = agent.groupId;
      formationSlots[slot * 2] = formationSlot.x;
      formationSlots[slot * 2 + 1] = formationSlot.y;
    }
  }

  return {
    targets,
    speed,
    groupIds,
    formationSlots,
    hazardAvoidance,
    holding,
    routedHeading,
    radii,
    speedFactors,
  };
}

/**
 * `crowdMovement.ts`'s own model constants, translated into the shape
 * `createGpuSimCore`/`stepForParity` take — a real, reusable mapping (every
 * real caller of `createGpuCrowdPlanePool` needs it, not just tests), not
 * duplicated field-by-field wherever a `GpuSimCoreSocialForceParams` is
 * needed. `desiredSpeed`/`maxSpeed` are the two fields with no
 * `SocialForceParameters` counterpart: `desiredSpeed` is only a fallback
 * the kernel uses when a per-agent `speed[]` entry is `<= 0` (never true
 * here -- `buildGpuCrowdUploadArrays` always writes a real, positive free
 * speed), and `maxSpeed` is the stage 1-5 flat clamp stage 6 superseded
 * with `freeSpeed * maxSpeedRatio` (kept only because the shared type
 * still declares it) -- both given a placeholder that cannot affect the
 * result.
 */
export function toGpuSimCoreParams(
  parameters: SocialForceParameters,
  dtSeconds: number,
): GpuSimCoreSocialForceParams {
  return {
    dt: dtSeconds,
    desiredSpeed: 1, // unused, see above
    relaxationTime: parameters.relaxationSeconds,
    agentRepulsionStrength: parameters.agentStrength,
    agentRepulsionRange: parameters.agentRangeMeters,
    wallRepulsionStrength: parameters.wallStrength,
    wallRepulsionRange: parameters.wallRangeMeters,
    maxSpeed: 1.7, // unused, see above
    anisotropy: parameters.anisotropy,
    contactStiffness: parameters.contactStiffness,
    interactionRangeMeters: parameters.interactionRangeMeters,
    sidestep: parameters.sidestep,
    sidestepCone: parameters.sidestepCone,
    anticipationStrength: parameters.anticipationStrength,
    anticipationHorizonSeconds: parameters.anticipationHorizonSeconds,
    anticipationRangeMeters: parameters.anticipationRangeMeters,
    anticipationMaxAcceleration: parameters.anticipationMaxAcceleration,
    holdEaseMeters: parameters.holdEaseMeters,
    maxSpeedRatio: parameters.maxSpeedRatio,
  };
}

export type GpuCrowdStepInput = {
  plane: GpuCrowdPlane;
  agents: readonly SimulationAgent[];
  dtSeconds: number;
  meanSpeedMetersPerSecond: number;
  router: Pick<Router, "direction">;
  /** For the post-readback hard wall constraint — the same `WallIndex` the
   * CPU path already builds per plane (`FloorRuntime.walls`), reused
   * as-is (ADR-0033's whole premise: wall/exit handling needs no kernel
   * involvement, only reapplication to GPU-produced positions). */
  wallIndex: WallIndex;
  world?: SceneWorldBounds;
  seed: number;
  isExitBound: (agent: SimulationAgent) => boolean;
  exitRadius: (agent: SimulationAgent) => number;
  exitedSinkIds?: string[];
};

/**
 * The GPU-backed alternate to `stepCrowd` for one plane's population,
 * verified (ADR-0033 stage 2) by comparing its output to `stepCrowd`'s for
 * the same scene/seed/tick sequence within the disclosed tolerance. Async,
 * unlike `stepCrowd` — a GPU readback is inherently asynchronous, and
 * `advanceAgentsCpu`'s own per-tick loop is not yet wired to await this
 * (stage 3's "real runtime switch"); this function is independently
 * callable and tested today, not yet the thing `advanceAgentsCpu` calls.
 */
export async function advanceAgentsGpu(input: GpuCrowdStepInput): Promise<{
  agents: SimulationAgent[];
  exitedCount: number;
}> {
  const { plane } = input;
  const next: SimulationAgent[] = [];
  let exitedCount = 0;
  const walking: SimulationAgent[] = [];

  // Exit check BEFORE movement, using last tick's position -- identical to
  // stepCrowd's own early continue (Context section of ADR-0033: no kernel
  // involvement needed for this at all, GPU or not).
  for (const agent of input.agents) {
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const distance = Math.hypot(dx, dy);
    if (input.isExitBound(agent) && distance <= input.exitRadius(agent)) {
      exitedCount++;
      if (input.exitedSinkIds && agent.targetSinkId) {
        input.exitedSinkIds.push(agent.targetSinkId);
      }
      continue;
    }
    walking.push(agent);
  }

  if (walking.length === 0) {
    return { agents: next, exitedCount };
  }

  const { slots, spawnedIds, relocatedIds } = plane.allocator.sync(
    walking.map((agent) => agent.id),
  );
  const needsFullUpload = new Set([...spawnedIds, ...relocatedIds]);
  // The allocator's own packing invariant: after sync(), live ids occupy
  // exactly [0, walking.length) -- no gaps, so count is just this, never a
  // Math.max(...slots)-style computation (also unsafe for a large spread).
  const count = walking.length;

  const arrays = buildGpuCrowdUploadArrays(
    walking,
    slots,
    count,
    input.meanSpeedMetersPerSecond,
    input.router,
    input.seed,
  );

  const spawns: AgentSpawn[] = [];
  for (let i = 0; i < walking.length; i++) {
    const agent = walking[i];
    if (!needsFullUpload.has(agent.id)) continue;
    const slot = slots[i];
    spawns.push({
      index: slot,
      x: agent.x,
      y: agent.y,
      vx: agent.vx,
      vy: agent.vy,
      speed: arrays.speed[slot],
      radius: arrays.radii[i],
      targetX: agent.targetX,
      targetY: agent.targetY,
    });
  }

  plane.core.setCount(count);
  if (spawns.length > 0) plane.core.uploadSpawns(spawns);
  plane.core.uploadTargets(arrays.targets);
  plane.core.uploadSpeeds(arrays.speed);
  plane.core.uploadGroupIds(arrays.groupIds);
  plane.core.uploadFormationSlots(arrays.formationSlots);
  plane.core.uploadHazardAvoidance(arrays.hazardAvoidance);
  plane.core.uploadHolding(arrays.holding);
  plane.core.uploadRoutedHeading(arrays.routedHeading);

  plane.core.step(input.dtSeconds);
  const readback = await plane.core.readback();

  for (let i = 0; i < walking.length; i++) {
    const agent = walking[i];
    const slot = slots[i];
    const proposed = {
      x: readback.positions[slot * 2],
      y: readback.positions[slot * 2 + 1],
    };
    const stepLength =
      Math.hypot(readback.velocities[slot * 2], readback.velocities[slot * 2 + 1]) *
      input.dtSeconds;
    const reachable =
      stepLength < 0.5
        ? input.wallIndex.near(agent.x, agent.y, 1)
        : input.wallIndex.near(agent.x, agent.y, 1 + stepLength);
    const resolved = constrainMovement(agent, proposed, reachable, input.world);
    let vx = readback.velocities[slot * 2];
    let vy = readback.velocities[slot * 2 + 1];
    if (resolved.blocked || resolved.x !== proposed.x || resolved.y !== proposed.y) {
      vx = (resolved.x - agent.x) / input.dtSeconds;
      vy = (resolved.y - agent.y) / input.dtSeconds;
    }
    next.push({
      ...agent,
      radius: arrays.radii[i],
      speedFactor: arrays.speedFactors[i],
      vx,
      vy,
      x: resolved.x,
      y: resolved.y,
    });
  }

  return { agents: next, exitedCount };
}
