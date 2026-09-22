import type { CrowdSimScene } from "./index";

/**
 * Floors, and how to look at one of them (ADR-0010).
 *
 * A scene is a stack of floors, each a plane of its own. This module is the one
 * place that says what that means for a scene's contents, so that no reader has
 * to invent its own rule:
 *
 * - **A scene with no declared floors is one floor**, and everything is on it.
 *   That is every scene written before floors existed, and they must keep
 *   working untouched.
 * - **A primitive with no `floorId` is on the base floor** — the lowest `level`
 *   declared. This is what an older scene means when floors are added above it,
 *   and it is the only reading that leaves those scenes alone.
 *
 * What this module does NOT do: route or move anyone. Routing between floors
 * lives in `floorRouting.ts` and the crossing in `floorTransfers.ts`; the scene
 * level declares `connectors` (stairs, escalators and lifts) and the engine
 * carries agents across them. This module only says which primitive sits on
 * which floor, and resolves an absent `floorId` to the base floor.
 */

export type SceneFloor = CrowdSimScene["floors"][number];

/** Floors in vertical order, lowest first. Empty when the scene declares none. */
export function sceneFloors(scene: CrowdSimScene): readonly SceneFloor[] {
  return [...scene.floors].sort((a, b) => a.level - b.level);
}

/**
 * The floor a primitive with no `floorId` belongs to: the lowest declared one.
 * Undefined when the scene declares no floors, which is the same as saying
 * there is only one floor and it needs no name.
 */
export function baseFloorId(scene: CrowdSimScene): string | undefined {
  return sceneFloors(scene)[0]?.id;
}

/** The floor this primitive is on, resolving an absent `floorId` to the base. */
export function resolveFloorId(
  scene: CrowdSimScene,
  entity: { floorId?: string },
): string | undefined {
  return entity.floorId ?? baseFloorId(scene);
}

/**
 * Spatial arrays: the ones whose entries sit somewhere on a floor. Listed by
 * name on purpose — the alternative is checking for a `floorId` at runtime,
 * which cannot tell "this floor" from "this scene has no such concept", and
 * would quietly drop brand profiles and weather from every upper floor.
 */
const spatialArrays = [
  "areas",
  "basemaps",
  "buildings",
  "countLines",
  "entrances",
  "hazards",
  "obstacles",
  "roads",
  "servicePoints",
  "shops",
  "storeLots",
  "targets",
  "transitStops",
  "walls",
  "zones",
] as const satisfies readonly (keyof CrowdSimScene)[];

/**
 * The scene as it is on one floor: the same scene with everything on other
 * floors taken out, and that floor's own world size if it declares one.
 *
 * The scene keeps its non-spatial parts whole — brands, weather, the event
 * timeline — because they belong to the run rather than to a plane.
 *
 * Returns the scene unchanged when it declares no floors, and null when the
 * floor is not one of the scene's.
 */
export function sceneOnFloor(
  scene: CrowdSimScene,
  floorId: string,
): CrowdSimScene | null {
  const floor = scene.floors.find((candidate) => candidate.id === floorId);

  if (!floor) {
    return null;
  }

  const base = baseFloorId(scene);
  const onThisFloor = (entity: { floorId?: string }) =>
    (entity.floorId ?? base) === floorId;

  const filtered: Partial<Record<(typeof spatialArrays)[number], unknown>> = {};

  for (const key of spatialArrays) {
    filtered[key] = (scene[key] as readonly { floorId?: string }[]).filter(onThisFloor);
  }

  return {
    ...scene,
    ...filtered,
    world: floor.world ?? scene.world,
  } as CrowdSimScene;
}
