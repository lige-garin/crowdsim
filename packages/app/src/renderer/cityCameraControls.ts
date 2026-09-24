import type { PerspectiveCamera } from "three";
import { isClick } from "../agentPicking";
import { clamp } from "../numberUtils";
import {
  orbitByDrag,
  orbitToPosition,
  panByDrag,
  panByKeys,
  RADIUS_MAX,
  RADIUS_MIN,
  zoomByWheel,
  type GroundPoint,
  type OrbitState,
} from "../orbitCamera";

type Limit = { maxX: number; maxY: number; minX: number; minY: number };

export type CityCameraRig = {
  orbit: OrbitState;
  target: GroundPoint;
};

/**
 * City-builder camera controls on the viewport canvas.
 *
 *   left drag        pan the city
 *   right drag       rotate / tilt   (also shift + left drag)
 *   wheel            zoom
 *   W A S D / arrows pan            Q / E rotate
 *
 * The old viewport only orbited around a fixed origin, so there was no way to
 * go and look at a street: you could spin the model, not travel through the
 * city. Rig state lives in a caller-owned object so it survives the renderer
 * being rebuilt for a scene change.
 */
/**
 * Lets a drawing tool (currently only the 3D count-line tool, ADR-0031)
 * claim a left-button drag for its own two-point gesture instead of the
 * camera's own pan. `isActive` is polled fresh on every `pointerdown`
 * rather than latched, so a tool switch mid-hover (no pointer held) is
 * picked up the same way `placementGhost.ts`'s own `getTool` already is.
 */
export type CityCameraToolHook = {
  isActive: () => boolean;
  onDown: (clientX: number, clientY: number) => void;
  onMove: (clientX: number, clientY: number) => void;
  onUp: (clientX: number, clientY: number) => void;
};

export function attachCityCameraControls(options: {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  limit: Limit;
  onClick: (clientX: number, clientY: number) => void;
  rig: CityCameraRig;
  tool?: CityCameraToolHook;
}) {
  const { camera, canvas, limit, onClick, rig, tool } = options;
  const pressed = new Set<string>();
  const drag = { button: -1, downX: 0, downY: 0, lastX: 0, lastY: 0 };
  // Set only while a tool (not the camera) owns the current pointer
  // sequence — `drag.button` is deliberately left at -1 for the whole of
  // that sequence, so the ordinary pan/orbit/click logic below never runs
  // for it.
  let toolDragging = false;
  let lastTick = performance.now();
  let frame = 0;

  const apply = () => {
    const position = orbitToPosition(rig.orbit, {
      x: rig.target.x,
      y: rig.target.y,
      z: 0,
    });
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(rig.target.x, rig.target.y, 0);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 0 && !event.shiftKey && tool?.isActive()) {
      toolDragging = true;
      canvas.setPointerCapture(event.pointerId);
      tool.onDown(event.clientX, event.clientY);
      return;
    }
    drag.button = event.button === 0 && event.shiftKey ? 2 : event.button;
    drag.downX = drag.lastX = event.clientX;
    drag.downY = drag.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (toolDragging) {
      tool!.onMove(event.clientX, event.clientY);
      return;
    }
    if (drag.button < 0) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (drag.button === 0) {
      rig.target = panByDrag(rig.target, rig.orbit, dx, dy, canvas.clientHeight, limit);
    } else {
      rig.orbit = orbitByDrag(rig.orbit, dx, dy);
    }
    apply();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (toolDragging) {
      toolDragging = false;
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      tool!.onUp(event.clientX, event.clientY);
      return;
    }
    const wasLeftClick =
      drag.button === 0 &&
      isClick(event.clientX - drag.downX, event.clientY - drag.downY);
    drag.button = -1;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (wasLeftClick) onClick(event.clientX, event.clientY);
  };

  // A cancelled pointer (touch or pen gesture, the OS taking the pointer, focus
  // lost mid-drag) never sends pointerup. Without this the drag stayed armed and
  // the next hover panned or orbited the camera with no button held.
  const onPointerCancel = (event: PointerEvent) => {
    drag.button = -1;
    toolDragging = false;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
  };
  const onLostPointerCapture = () => {
    drag.button = -1;
    toolDragging = false;
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    rig.orbit = zoomByWheel(rig.orbit, event.deltaY);
    apply();
  };

  const onContextMenu = (event: Event) => event.preventDefault();

  const typing = () => {
    const active = document.activeElement;
    return (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (typing()) return;
    const key = event.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "q",
        "e",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    ) {
      pressed.add(key);
      // Arrows also scroll the nearest scrollable ancestor (the stage pane).
      if (key.startsWith("arrow")) event.preventDefault();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => pressed.delete(event.key.toLowerCase());
  const onBlur = () => pressed.clear();

  const tick = (now: number) => {
    const seconds = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    if (pressed.size > 0) {
      const keys = {
        back: pressed.has("s") || pressed.has("arrowdown"),
        forward: pressed.has("w") || pressed.has("arrowup"),
        left: pressed.has("a") || pressed.has("arrowleft"),
        right: pressed.has("d") || pressed.has("arrowright"),
      };
      rig.target = panByKeys(rig.target, rig.orbit, keys, seconds, limit);
      const turn = (pressed.has("e") ? 1 : 0) - (pressed.has("q") ? 1 : 0);
      if (turn !== 0)
        rig.orbit = { ...rig.orbit, azimuth: rig.orbit.azimuth + turn * seconds * 1.4 };
      apply();
    }
    frame = window.requestAnimationFrame(tick);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  frame = window.requestAnimationFrame(tick);
  apply();

  return () => {
    window.cancelAnimationFrame(frame);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}

/**
 * Where a fresh city camera starts: a three-quarter view over the district.
 *
 * `radius` used to be a flat 210 m regardless of the scene. The district
 * (the scene's own content -- every industry template is 82-121 m across
 * on its diagonal, see `exampleScenes.ts`/`industryTemplates.ts`) sits
 * inside a 150 m generated ring of filler downtown that looks the same for
 * every template (`cityLayout.ts`'s `ring`); at a fixed 210 m that ring
 * dominated the frame and the district itself read as a small, similar-
 * looking patch in the middle -- different templates looked near-identical
 * on first load, confirmed directly in the browser pane (every template's
 * opening framing was the same wide shot of generic downtown). Scaling
 * `radius` off the district's own diagonal instead keeps the district the
 * dominant thing on screen regardless of which template it is, verified by
 * eye against the real renderer for several templates rather than derived
 * from the FOV maths alone (the camera's tilt makes the maths a rough guide,
 * not an exact answer).
 *
 * Clamped to `RADIUS_MIN`/`RADIUS_MAX` -- the same bounds `zoomByWheel`
 * already enforces on every interactive zoom. `world` has no upper size
 * limit in the schema, and an imported building (`ifcImport.ts`/
 * `dxfImport.ts`, ADR-0018) can easily be large enough that an unclamped
 * `diagonal * 0.75` starts outside that range: the first scroll would then
 * snap the camera to the bound instead of zooming smoothly from it, and
 * `panByKeys`'s speed (which scales off `radius`) would be off by the same
 * factor until that snap happened.
 */
export function initialCityCameraRig(world: {
  height: number;
  width: number;
}): CityCameraRig {
  const diagonal = Math.hypot(world.width, world.height);
  return {
    orbit: {
      azimuth: (-120 * Math.PI) / 180,
      polar: (44 * Math.PI) / 180,
      radius: clamp(diagonal * 0.75, RADIUS_MIN, RADIUS_MAX),
    },
    target: { x: 0, y: 0 },
  };
}
