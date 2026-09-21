import type { EditorDocument, EditorFloor } from "./sceneEditorTypes";

/**
 * Floors in the editor (ADR-0010): drawing one floor at a time.
 *
 * Mirrors the scene rule in `@crowdsim/scene-schema`'s `sceneFloors`: a
 * document with no floors is one floor and everything is on it, and a
 * primitive with no `floorId` is on the lowest floor declared.
 *
 * People walk between floors through the connectors drawn with the stairs
 * tool (`addConnector`). A floor with no connector to it is one nobody can
 * reach: the editor lets it be drawn, and the run then strands whoever starts
 * on it, which is what an unreachable floor is.
 */

/** Every document array that holds something standing on a floor. */
const spatialKeys = [
  "buildings",
  "countLines",
  "entrances",
  "hazards",
  "obstacles",
  "roads",
  "servicePoints",
  "shops",
  "targets",
  "transitStops",
  "walls",
  "zones",
] as const satisfies readonly (keyof EditorDocument)[];

/** Floors lowest first. */
export function editorFloors(document: EditorDocument): readonly EditorFloor[] {
  return [...document.floors].sort((a, b) => a.level - b.level);
}

/** The floor an unstamped primitive is on, or undefined when there are none. */
export function editorBaseFloorId(document: EditorDocument): string | undefined {
  return editorFloors(document)[0]?.id;
}

/** Whether this primitive shows on the floor being drawn. */
export function isOnFloor(
  document: EditorDocument,
  entity: { floorId?: string },
  floorId: string | undefined,
): boolean {
  return (entity.floorId ?? editorBaseFloorId(document)) === floorId;
}

/**
 * The document as it is on the floor being drawn, for the canvas to render.
 * Unchanged when the document declares no floors, so a single-floor scene is
 * drawn exactly as it was before floors existed.
 */
export function documentOnActiveFloor(document: EditorDocument): EditorDocument {
  if (document.floors.length === 0) {
    return document;
  }

  const filtered: Record<string, unknown> = {};

  for (const key of spatialKeys) {
    filtered[key] = (document[key] as readonly { floorId?: string }[]).filter(
      (entity) => isOnFloor(document, entity, document.activeFloorId),
    );
  }

  // A connector is on two floors at once, and is drawn on both: from either
  // one it is somewhere you can walk to.
  filtered.connectors = document.connectors.filter(
    (connector) =>
      connector.fromFloorId === document.activeFloorId ||
      connector.toFloorId === document.activeFloorId,
  );

  return { ...document, ...filtered } as EditorDocument;
}

/**
 * A new floor above the highest one, made active.
 *
 * A document with no floors gets two: the plane it already had, named as the
 * ground floor, and the new one above it. Everything already drawn keeps no
 * `floorId` and so stays on the ground floor by the base-floor rule — the
 * alternative, stamping every primitive, would rewrite a scene the user did
 * not ask to have rewritten.
 */
export function addFloor(document: EditorDocument): EditorDocument {
  const existing = editorFloors(document);
  const ground: EditorFloor[] =
    existing.length === 0
      ? [{ id: `floor-${document.nextId}`, level: 0, elevationMeters: 0 }]
      : [];
  const below = [...existing, ...ground];
  const highest = below[below.length - 1];
  const addedId = `floor-${document.nextId + ground.length}`;
  const added: EditorFloor = {
    id: addedId,
    level: (highest?.level ?? -1) + 1,
    // 4.5 m floor to floor: a retail storey, and only ever drawn. Nothing
    // simulated reads it, because nothing crosses between floors yet.
    elevationMeters: (highest?.elevationMeters ?? 0) + 4.5,
  };

  return {
    ...document,
    activeFloorId: addedId,
    floors: [...below, added],
    nextId: document.nextId + ground.length + 1,
  };
}

/**
 * Switch the floor being drawn. A selection on another floor is dropped: it
 * cannot be seen, and the parameter panel would otherwise edit something
 * invisible.
 */
export function setActiveFloor(
  document: EditorDocument,
  floorId: string,
): EditorDocument {
  if (!document.floors.some((floor) => floor.id === floorId)) {
    return document;
  }

  return { ...document, activeFloorId: floorId };
}

/** How a floor is named when it has no name: "L1", "L2", a basement as "B1". */
export function floorLabel(floor: EditorFloor): string {
  if (floor.name) {
    return floor.name;
  }

  return floor.level < 0 ? `B${-floor.level}` : `L${floor.level + 1}`;
}
