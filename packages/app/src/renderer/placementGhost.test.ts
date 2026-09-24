import { PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { defaultDemoScene } from "../defaultDemoScene";
import { attachPlacementGhost } from "./placementGhost";
import type { EditorTool } from "../sceneEditorState";

function setup() {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ height: 600, left: 0, top: 0, width: 800 }) as DOMRect;
  const camera = new PerspectiveCamera(40, 800 / 600, 0.5, 2600);
  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, 200);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const parent = new Scene();
  let tool: EditorTool = "source";
  const ghostApi = attachPlacementGhost({
    camera,
    canvas,
    getScene: () => defaultDemoScene,
    getTool: () => tool,
    onPlace: () => undefined,
    parent,
  });
  const ghost = parent.getObjectByName("placement-ghost")!;
  // jsdom has no PointerEvent; the listener only reads the coordinates.
  const move = (clientX: number, clientY: number) =>
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY }));
  return {
    canvas,
    ghost,
    ghostApi,
    move,
    setTool: (next: EditorTool) => {
      tool = next;
    },
  };
}

describe("placement ghost", () => {
  it("follows the pointer while a placing tool is held", () => {
    const { canvas, ghost, move } = setup();
    move(400, 300);
    expect(ghost.visible).toBe(true);
    expect(canvas.style.cursor).toBe("crosshair");
  });

  it("disappears as soon as the tool is dropped, without waiting for the mouse", () => {
    const { canvas, ghost, ghostApi, move, setTool } = setup();
    move(400, 300);

    setTool("select");
    ghostApi.refresh();

    // It used to stay, with a crosshair, until the next mouse move; a click in
    // between picked an agent under a ghost that still promised a placement.
    expect(ghost.visible).toBe(false);
    expect(canvas.style.cursor).toBe("");
  });

  it("appears for a newly picked tool at the last pointer position", () => {
    const { ghost, ghostApi, move, setTool } = setup();
    setTool("select");
    move(400, 300);
    expect(ghost.visible).toBe(false);

    setTool("building");
    ghostApi.refresh();

    expect(ghost.visible).toBe(true);
  });
});
