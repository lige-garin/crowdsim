import { describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import {
  addFloor,
  documentOnActiveFloor,
  editorBaseFloorId,
  floorLabel,
  setActiveFloor,
} from "./sceneEditorFloors";
import {
  addConnector,
  addShop,
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
  moveEntity,
} from "./sceneEditorState";

const baseScene = demoScene;
const baseDocument = createEditorDocumentFromScene(baseScene);

describe("editor floors", () => {
  it("leaves a document with no floors exactly as it was", () => {
    expect(baseDocument.floors).toEqual([]);
    expect(baseDocument.activeFloorId).toBeUndefined();
    expect(documentOnActiveFloor(baseDocument)).toBe(baseDocument);
  });

  it("adding the first floor names the plane already drawn and puts one above it", () => {
    const withFloors = addFloor(baseDocument);

    expect(withFloors.floors).toHaveLength(2);
    expect(withFloors.floors.map((floor) => floor.level)).toEqual([0, 1]);
    expect(withFloors.activeFloorId).toBe(withFloors.floors[1].id);
    // Nothing already drawn was stamped: it stays on the ground floor by the
    // base-floor rule.
    expect(withFloors.walls.every((wall) => wall.floorId === undefined)).toBe(true);
    expect(editorBaseFloorId(withFloors)).toBe(withFloors.floors[0].id);
  });

  it("draws onto the floor that is active, and shows only that floor", () => {
    const upstairs = addFloor(baseDocument);
    const drawn = addShop(upstairs, { x: 20, y: 20 });
    const groundId = editorBaseFloorId(drawn) ?? "";

    expect(drawn.shops.at(-1)?.floorId).toBe(drawn.activeFloorId);
    expect(documentOnActiveFloor(drawn).shops).toHaveLength(1);
    // The walls the scene came with are downstairs, so they are not drawn here.
    expect(documentOnActiveFloor(drawn).walls).toHaveLength(0);

    const downstairs = documentOnActiveFloor(setActiveFloor(drawn, groundId));

    expect(downstairs.shops).toHaveLength(baseDocument.shops.length);
    expect(downstairs.walls).toHaveLength(baseDocument.walls.length);
  });

  it("ignores a switch to a floor the document does not have", () => {
    const withFloors = addFloor(baseDocument);

    expect(setActiveFloor(withFloors, "no-such-floor")).toBe(withFloors);
  });

  it("carries floors and the floor each thing is on through a scene round trip", () => {
    const drawn = addShop(addFloor(baseDocument), { x: 20, y: 20 });
    const scene = createSceneFromEditorDocument(baseScene, drawn);
    const reopened = createEditorDocumentFromScene(scene);

    expect(scene.floors.map((floor) => floor.level)).toEqual([0, 1]);
    expect(scene.shops.at(-1)?.floorId).toBe(drawn.activeFloorId);
    expect(reopened.floors).toEqual(drawn.floors);
    expect(reopened.shops.at(-1)?.floorId).toBe(drawn.shops.at(-1)?.floorId);
    // Reopening starts on the ground floor, whatever was being drawn before.
    expect(reopened.activeFloorId).toBe(editorBaseFloorId(reopened));
  });

  it("stacks further floors on top of the highest one", () => {
    const third = addFloor(addFloor(baseDocument));

    expect(third.floors.map((floor) => floor.level)).toEqual([0, 1, 2]);
    expect(third.floors.map((floor) => floor.elevationMeters)).toEqual([0, 4.5, 9]);
    expect(new Set(third.floors.map((floor) => floor.id)).size).toBe(3);
  });

  it("labels an unnamed floor by where it is in the stack", () => {
    expect(floorLabel({ id: "a", level: 0, elevationMeters: 0 })).toBe("L1");
    expect(floorLabel({ id: "b", level: 2, elevationMeters: 9 })).toBe("L3");
    expect(floorLabel({ id: "c", level: -1, elevationMeters: -4 })).toBe("B1");
    expect(floorLabel({ id: "d", name: "Atrium", level: 0, elevationMeters: 0 })).toBe(
      "Atrium",
    );
  });
});

describe("stairs between floors", () => {
  it("places nothing in a scene with one floor, because there is nothing to join", () => {
    expect(addConnector(baseDocument, { x: 20, y: 20 })).toBe(baseDocument);
  });

  it("joins the floor being drawn to the one below it", () => {
    const upstairs = addFloor(baseDocument);
    const placed = addConnector(upstairs, { x: 20, y: 20 });
    const connector = placed.connectors[0];

    expect(placed.connectors).toHaveLength(1);
    // Drawn from the lower floor up, both ends at the point clicked.
    expect(connector.fromFloorId).toBe(editorBaseFloorId(placed));
    expect(connector.toFloorId).toBe(upstairs.activeFloorId);
    expect(connector.fromPoint).toEqual({ x: 20, y: 20 });
    expect(connector.toPoint).toEqual({ x: 20, y: 20 });
    expect(connector.kind).toBe("stair");
    expect(connector.bidirectional).toBe(true);
  });

  it("shows a connector on both floors it joins", () => {
    const placed = addConnector(addFloor(baseDocument), { x: 20, y: 20 });
    const groundId = editorBaseFloorId(placed) ?? "";

    expect(documentOnActiveFloor(placed).connectors).toHaveLength(1);
    expect(
      documentOnActiveFloor(setActiveFloor(placed, groundId)).connectors,
    ).toHaveLength(1);
  });

  it("carries it through a scene round trip, ends and all", () => {
    const placed = addConnector(addFloor(baseDocument), { x: 20, y: 20 });
    const scene = createSceneFromEditorDocument(baseScene, placed);
    const reopened = createEditorDocumentFromScene(scene);

    expect(scene.connectors[0].from.floorId).toBe(placed.connectors[0].fromFloorId);
    expect(scene.connectors[0].width).toBe(1.2);
    // A round trip through the scene schema also picks up its lift-only
    // defaults (capacity/carCount/doorSeconds) and a name field, which the
    // editor's own `addConnector` never set on a plain stair — present now,
    // not lost.
    expect(reopened.connectors).toEqual([
      {
        ...placed.connectors[0],
        capacity: 8,
        carCount: 1,
        doorSeconds: 4,
        name: undefined,
      },
    ]);
  });

  it("moves both ends together when the stair well is dragged", () => {
    const placed = addConnector(addFloor(baseDocument), { x: 20, y: 20 });
    const moved = moveEntity(placed, placed.connectors[0].id, { x: 4, y: -2 });

    expect(moved.connectors[0].fromPoint).toEqual({ x: 24, y: 18 });
    expect(moved.connectors[0].toPoint).toEqual({ x: 24, y: 18 });
  });
});

describe("ids for floors and stairs", () => {
  it("does not hand the same number out again after a save and reopen", () => {
    const drawn = addConnector(addFloor(baseDocument), { x: 20, y: 20 });
    const applied = createSceneFromEditorDocument(baseScene, drawn);
    const reopened = createEditorDocumentFromScene(applied);

    // Whatever the scene already holds, the next id is past all of it —
    // including the floors and the stair, which used to be skipped.
    const used = [
      ...applied.floors.map((floor) => floor.id),
      ...applied.connectors.map((connector) => connector.id),
    ];
    for (const id of used) {
      const number = Number(/-(\d+)$/.exec(id)?.[1] ?? 0);
      expect(reopened.nextId).toBeGreaterThan(number);
    }

    // And a second floor drawn after reopening applies cleanly.
    const second = addFloor(reopened);
    const ids = second.floors.map((floor) => floor.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(() => createSceneFromEditorDocument(applied, second)).not.toThrow();
  });
});
