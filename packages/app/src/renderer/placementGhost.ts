import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import {
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Camera,
  type Object3D,
} from "three";
import type { EditorTool } from "../sceneEditorState";
import {
  placementConflict,
  placementFootprint,
  placesInWorld,
  scenePointAtScreen,
} from "./worldPlacement";

const OK_COLOR = 0x4fd18b;
const BLOCKED_COLOR = 0xe5484d;

/**
 * The translucent footprint that follows the cursor while a build tool is held,
 * and the click that drops the item where it shows.
 *
 * A city builder never makes you guess where a click will land: the thing you
 * are about to build hovers on the ground first. The tool is read through a
 * getter each time so switching tools does not rebuild the renderer.
 */
export function attachPlacementGhost(options: {
  camera: Camera;
  canvas: HTMLCanvasElement;
  getTool: () => EditorTool | undefined;
  onPlace: (tool: EditorTool, point: ScenePoint) => void;
  parent: Object3D;
  /**
   * Read on every move so a hot scene update is seen without rebuilding the
   * ghost (the viewport no longer rebuilds on scene changes).
   */
  getScene: () => CrowdSimScene | undefined;
}) {
  const { camera, canvas, getScene, getTool, onPlace, parent } = options;
  const ghost = new Group();
  ghost.name = "placement-ghost";
  ghost.visible = false;
  const plane = new PlaneGeometry(1, 1);
  const fillMaterial = new MeshBasicMaterial({
    color: OK_COLOR,
    depthWrite: false,
    opacity: 0.35,
    transparent: true,
  });
  const outlineMaterial = new LineBasicMaterial({ color: OK_COLOR });
  const fill = new Mesh(plane, fillMaterial);
  const outline = new LineSegments(new EdgesGeometry(plane), outlineMaterial);
  fill.renderOrder = outline.renderOrder = 10;
  ghost.add(fill, outline);
  parent.add(ghost);

  const pointAt = (world: CrowdSimScene["world"], clientX: number, clientY: number) =>
    scenePointAtScreen(camera, canvas.getBoundingClientRect(), clientX, clientY, world);

  // Last pointer position over the canvas, so the ghost can be re-evaluated
  // when the tool changes without the mouse moving (Escape, a toolbar click).
  let lastPointer: { clientX: number; clientY: number } | null = null;
  const update = (clientX: number, clientY: number) => {
    const tool = getTool();
    const scene = getScene();
    const point =
      scene && tool && placesInWorld(tool)
        ? pointAt(scene.world, clientX, clientY)
        : null;
    canvas.style.cursor = tool && placesInWorld(tool) ? "crosshair" : "";
    if (!scene || !tool || !point) {
      ghost.visible = false;
      return;
    }
    // Red, and a refusing cursor, when something solid is in the way: the
    // click would do nothing, so say so before it is made.
    const blocked = placementConflict(scene, tool, point) !== null;
    const color = blocked ? BLOCKED_COLOR : OK_COLOR;
    fillMaterial.color.setHex(color);
    outlineMaterial.color.setHex(color);
    canvas.style.cursor = blocked ? "not-allowed" : "crosshair";
    const size = placementFootprint(tool);
    ghost.scale.set(size.width, size.depth, 1);
    // Scene y-down to render y-up; lift a hair off the paving to avoid z-fighting.
    const { world } = scene;
    ghost.position.set(point.x - world.width / 2, world.height / 2 - point.y, 0.15);
    ghost.visible = true;
  };
  const onPointerMove = (event: PointerEvent) => {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    update(event.clientX, event.clientY);
  };
  const onPointerLeave = () => {
    lastPointer = null;
    ghost.visible = false;
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  return {
    /** Re-evaluate ghost and cursor for the current tool at the last pointer. */
    refresh() {
      if (lastPointer) {
        update(lastPointer.clientX, lastPointer.clientY);
        return;
      }
      ghost.visible = false;
      canvas.style.cursor = "";
    },
    /** True when the click was a placement, so it must not also pick an agent. */
    handleClick(clientX: number, clientY: number) {
      const tool = getTool();
      const scene = getScene();
      if (!scene || !tool || !placesInWorld(tool)) return false;
      const point = pointAt(scene.world, clientX, clientY);
      if (point) onPlace(tool, point);
      return true;
    },
    dispose() {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.style.cursor = "";
      parent.remove(ghost);
      plane.dispose();
      outline.geometry.dispose();
      fillMaterial.dispose();
      outlineMaterial.dispose();
    },
  };
}
