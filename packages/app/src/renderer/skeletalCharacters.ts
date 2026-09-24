import { AnimationMixer, Group, Mesh, Object3D, type AnimationAction } from "three";
import { clamp } from "../numberUtils";
import { weidmannFundamentalDiagram } from "../pedestrianFundamentalDiagram";

/**
 * A small, bounded set of real skinned, rigged, walking humanoid characters
 * (Quaternius "Universal Base Characters" + "Universal Animation Library",
 * CC0 — see NOTICE) rendered for whichever pedestrians happen to be nearest
 * the camera in the 3D view, in place of their procedural `crowdFigures.ts`
 * body while they're close enough to matter.
 *
 * HONESTY NOTE: this is not a full-crowd upgrade and does not attempt to be
 * one. Unlike `crowdFigures.ts`, a skinned mesh's per-vertex bone pose can't
 * be batched into an `InstancedMesh` — each character here is its own draw
 * call plus its own `AnimationMixer.update()` every frame, so the pool is
 * capped (`DEFAULT_SKELETAL_CHARACTER_CAPACITY`) and only ever covers agents
 * within `DEFAULT_SKELETAL_NEAR_DISTANCE_METERS` of the camera. Everyone else
 * — the overwhelming majority of a 2,000-person crowd — is still drawn by
 * the cheap instanced figures in `crowdFigures.ts`. That split is exactly why
 * this can stay unconditionally on: it never has to carry the whole crowd.
 *
 * Only one body (`Superhero_Male_FullBody`, the one free body type that
 * shipped in glTF in the downloaded Standard pack) and two clips (Walk_Loop,
 * Idle_Loop) are wired in — every near-camera character currently looks like
 * the same person. Outfit/body variety is future work, not attempted here.
 *
 * Not clickable: `crowdFigures.ts`'s own `pick()` raycasts only its own
 * registered `InstancedMesh`es, so a skeletal character sitting where an
 * agent would otherwise be doesn't register a hit — selecting the closest
 * few people in the crowd is a known gap, not a silently accepted one.
 *
 * Loading is async and best-effort: if the assets fail to fetch, decode, or
 * are missing either clip, this stays inert (`update` returns an empty set
 * every frame) and the crowd renders exactly as it did before this module
 * existed — nothing else in the viewport depends on it existing.
 */

const CHARACTER_URL = "/assets/characters/quaternius/Superhero_Male_FullBody.gltf";
const WALK_ANIMATION_URL = "/assets/characters/quaternius/walk-animations.glb";
const WALK_CLIP_NAME = "Walk_Loop";
const IDLE_CLIP_NAME = "Idle_Loop";

export const DEFAULT_SKELETAL_CHARACTER_CAPACITY = 12;
/** Camera-to-agent distance, in metres, inside which a pedestrian gets a
 * real skinned character instead of the procedural figure. */
export const DEFAULT_SKELETAL_NEAR_DISTANCE_METERS = 20;

/** Same threshold `crowdFigures.ts` uses for its own "moving" check, so an
 * agent doesn't read as walking in one layer and standing in the other right
 * at the handoff distance. */
export const SKELETAL_MOVEMENT_THRESHOLD_METERS_PER_SECOND = 0.12;

const MIN_GAIT_TIME_SCALE = 0.15;
const MAX_GAIT_TIME_SCALE = 2.5;
const ACTION_TRANSITION_SECONDS = 0.2;

export type SkeletalCharacterAgent = {
  id: number;
  vx?: number;
  vy?: number;
  x: number;
  y: number;
};

/**
 * How much faster or slower than one nominal walk cycle (Weidmann free-flow
 * speed) the Walk_Loop clip should play so a fast walker's legs move faster
 * than a slow one's, not the same tempo at every speed. Clamped so a
 * near-stopped agent doesn't freeze mid-stride and a sprinting one doesn't
 * flail — both ends are engineering placeholders, not measured against real
 * gait-frequency data (this project has none to calibrate against).
 */
export function skeletalGaitTimeScale(speedMetersPerSecond: number): number {
  const ratio =
    speedMetersPerSecond / weidmannFundamentalDiagram.freeFlowSpeedMetersPerSecond;
  return clamp(ratio, MIN_GAIT_TIME_SCALE, MAX_GAIT_TIME_SCALE);
}

/**
 * The `capacity` agents nearest the camera, within `maxDistanceMeters`,
 * nearest-first. Pure and three.js-free so it's directly unit-testable; the
 * render-space conversion mirrors `agentWorldPosition`'s (render y is scene
 * y flipped, world-centred).
 */
export function selectNearestSkeletalAgents<T extends SkeletalCharacterAgent>(
  agents: readonly T[],
  world: { height: number; width: number },
  camera: { x: number; y: number; z: number },
  capacity: number,
  maxDistanceMeters: number,
): Array<{ agent: T; renderX: number; renderY: number }> {
  const maxDistanceSq = maxDistanceMeters * maxDistanceMeters;
  const candidates: Array<{
    agent: T;
    distanceSq: number;
    renderX: number;
    renderY: number;
  }> = [];
  for (const agent of agents) {
    const renderX = agent.x - world.width / 2;
    const renderY = world.height / 2 - agent.y;
    const dx = renderX - camera.x;
    const dy = renderY - camera.y;
    const distanceSq = dx * dx + dy * dy + camera.z * camera.z;
    if (distanceSq <= maxDistanceSq) {
      candidates.push({ agent, distanceSq, renderX, renderY });
    }
  }
  candidates.sort((a, b) => a.distanceSq - b.distanceSq);
  return candidates
    .slice(0, capacity)
    .map(({ agent, renderX, renderY }) => ({ agent, renderX, renderY }));
}

type Slot = {
  agentId: number | null;
  idleAction: AnimationAction;
  mixer: AnimationMixer;
  moving: boolean;
  root: Object3D;
  walkAction: AnimationAction;
};

export function createSkeletalCharacters() {
  const capacity = DEFAULT_SKELETAL_CHARACTER_CAPACITY;
  const group = new Group();
  group.name = "skeletal-characters";
  let disposed = false;
  let template: Object3D | undefined;
  const slots: Slot[] = [];
  const hiddenIds = new Set<number>();

  void (async () => {
    try {
      const [{ GLTFLoader }, skeletonUtils] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/utils/SkeletonUtils.js"),
      ]);
      const loader = new GLTFLoader();
      const [characterGltf, animationGltf] = await Promise.all([
        loader.loadAsync(CHARACTER_URL),
        loader.loadAsync(WALK_ANIMATION_URL),
      ]);
      if (disposed) return;
      const walkClip = animationGltf.animations.find(
        (clip) => clip.name === WALK_CLIP_NAME,
      );
      const idleClip = animationGltf.animations.find(
        (clip) => clip.name === IDLE_CLIP_NAME,
      );
      // Fail loud into "stays inert," not into a half-working fallback:
      // either clip missing means the pack changed shape, and guessing a
      // substitute clip would be worse than just not showing anyone.
      if (!walkClip || !idleClip) return;
      template = characterGltf.scene;
      for (let index = 0; index < capacity; index++) {
        const model = skeletonUtils.clone(template);
        // The character is authored Y-up (glTF's own convention; confirmed
        // against the real file — an unrotated clone's bounding box comes
        // out ~0.76 m "tall" and ~1.78 m along the other horizontal axis,
        // i.e. lying on its side). This scene is Z-up throughout
        // (`agentWorldPosition` draws every agent at z=0.9, ground is z=0)
        // — the same correction `sceneModelAssets.ts` applies for `upAxis:
        // "y-up"` visual assets. Applied to `model`, not `root`, so `root`'s
        // own z-rotation below (heading) still turns the character around
        // the scene's vertical axis, not the model's now-sideways one.
        model.rotation.x = Math.PI / 2;
        const root = new Object3D();
        root.add(model);
        root.visible = false;
        const mixer = new AnimationMixer(model);
        const walkAction = mixer.clipAction(walkClip);
        const idleAction = mixer.clipAction(idleClip);
        group.add(root);
        slots.push({
          agentId: null,
          idleAction,
          mixer,
          moving: false,
          root,
          walkAction,
        });
      }
    } catch {
      // Stays inert on any load failure (missing asset, decode error): the
      // crowd is still fully drawn by the procedural figures in
      // crowdFigures.ts — this is a close-up enhancement layer, not a
      // dependency anything else in the viewport relies on.
    }
  })();

  /**
   * @returns the ids of agents drawn this frame by a skeletal character, so
   *   the caller can pass them to `crowdFigures.ts`'s `update({ hidden })`
   *   and the two layers never draw the same person twice. The returned set
   *   is reused across calls — read it before the next `update()`, don't
   *   hold onto it.
   */
  function update(
    agents: readonly SkeletalCharacterAgent[],
    world: { height: number; width: number },
    options: {
      camera?: { x: number; y: number; z: number };
      deltaSeconds: number;
      maxDistanceMeters?: number;
    },
  ): ReadonlySet<number> {
    hiddenIds.clear();
    if (slots.length === 0 || !options.camera) return hiddenIds;
    const chosen = selectNearestSkeletalAgents(
      agents,
      world,
      options.camera,
      slots.length,
      options.maxDistanceMeters ?? DEFAULT_SKELETAL_NEAR_DISTANCE_METERS,
    );
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      const entry = chosen[index];
      if (!entry) {
        if (slot.agentId !== null) {
          slot.agentId = null;
          slot.root.visible = false;
        }
        continue;
      }
      hiddenIds.add(entry.agent.id);
      const vx = entry.agent.vx ?? 0;
      const vy = entry.agent.vy ?? 0;
      const speed = Math.hypot(vx, vy);
      const moving = speed > SKELETAL_MOVEMENT_THRESHOLD_METERS_PER_SECOND;
      if (slot.agentId !== entry.agent.id) {
        // A fresh assignment (new agent moved into range, or a slot came
        // free): snap straight to the right clip, no cross-fade — the two
        // characters have nothing to blend from, they're different people.
        slot.agentId = entry.agent.id;
        slot.root.visible = true;
        slot.moving = moving;
        slot.walkAction.stop();
        slot.idleAction.stop();
        (moving ? slot.walkAction : slot.idleAction).reset().play();
      } else if (moving !== slot.moving) {
        slot.moving = moving;
        const next = moving ? slot.walkAction : slot.idleAction;
        const previous = moving ? slot.idleAction : slot.walkAction;
        previous.fadeOut(ACTION_TRANSITION_SECONDS);
        next.reset().fadeIn(ACTION_TRANSITION_SECONDS).play();
      }
      slot.walkAction.timeScale = skeletalGaitTimeScale(speed);
      slot.root.position.set(entry.renderX, entry.renderY, 0);
      // Standing still: keep facing whichever way the character last faced
      // rather than snapping to 0 — matches crowdFigures.ts's own choice not
      // to redefine heading once velocity vanishes.
      if (moving) slot.root.rotation.z = Math.atan2(-vy, vx);
      slot.mixer.update(options.deltaSeconds);
    }
    return hiddenIds;
  }

  function dispose() {
    disposed = true;
    group.removeFromParent();
    for (const slot of slots) slot.mixer.stopAllAction();
    slots.length = 0;
    // Clones share geometry/material with `template` (SkeletonUtils.clone
    // clones the Object3D/skeleton hierarchy, not the mesh resources), so
    // those are disposed exactly once here, not per clone.
    template?.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    });
    template = undefined;
  }

  return { dispose, group, update };
}
