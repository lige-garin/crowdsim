import { PerspectiveCamera } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { RADIUS_MIN, RADIUS_MAX } from "../orbitCamera";
import { attachCityCameraControls, initialCityCameraRig } from "./cityCameraControls";

let detach: (() => void) | undefined;

afterEach(() => {
  detach?.();
  detach = undefined;
});

function setup() {
  const canvas = document.createElement("canvas");
  // jsdom has no pointer capture.
  canvas.setPointerCapture = () => undefined;
  canvas.releasePointerCapture = () => undefined;
  canvas.hasPointerCapture = () => false;
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  const rig = initialCityCameraRig({ height: 56, width: 96 });
  detach = attachCityCameraControls({
    camera: new PerspectiveCamera(),
    canvas,
    limit: { maxX: 500, maxY: 500, minX: -500, minY: -500 },
    onClick: () => undefined,
    rig,
  });
  // jsdom has no PointerEvent; the handlers read button and coordinates only.
  const fire = (type: string, clientX: number, clientY: number) =>
    canvas.dispatchEvent(new MouseEvent(type, { button: 0, clientX, clientY }));
  return { canvas, fire, rig };
}

describe("city camera controls", () => {
  it("pans while the left button drags", () => {
    const { fire, rig } = setup();
    const start = { ...rig.target };
    fire("pointerdown", 100, 100);
    fire("pointermove", 180, 140);
    expect(rig.target).not.toEqual(start);
  });

  it("stops dragging when the pointer is cancelled, so hovering does not pan", () => {
    const { fire, rig } = setup();
    fire("pointerdown", 100, 100);
    fire("pointercancel", 100, 100);
    const afterCancel = { ...rig.target };

    fire("pointermove", 300, 300);

    expect(rig.target).toEqual(afterCancel);
  });

  it("scales the starting distance with the district's own size, not a flat constant", () => {
    // A flat radius made every template's opening view dominated by the same
    // 150 m generated ring around the district (`cityLayout.ts`), so every
    // industry template looked like the same wide shot of generic downtown
    // on first load -- confirmed directly in the browser pane. Scaling by
    // the district's diagonal keeps the district itself the dominant thing
    // on screen regardless of which template it is.
    const small = initialCityCameraRig({ height: 36, width: 52 });
    const large = initialCityCameraRig({ height: 68, width: 100 });
    expect(large.orbit.radius).toBeGreaterThan(small.orbit.radius);
  });

  it("clamps the scaled radius to the same bounds interactive zoom already enforces", () => {
    // `world` has no upper size limit in the schema -- an imported building
    // (ifcImport.ts/dxfImport.ts) can be large enough that an unscaled
    // `diagonal * 0.75` lands outside RADIUS_MIN/RADIUS_MAX, which would
    // otherwise make the very first scroll snap the camera to the bound
    // instead of zooming smoothly from it. These sizes are chosen to push
    // diagonal * 0.75 past each bound, not to merely land inside it by
    // coincidence.
    const huge = initialCityCameraRig({ height: 500, width: 500 }); // diagonal*0.75 ~= 530
    expect(huge.orbit.radius).toBe(RADIUS_MAX);

    const tiny = initialCityCameraRig({ height: 8, width: 8 }); // diagonal*0.75 ~= 8.5
    expect(tiny.orbit.radius).toBe(RADIUS_MIN);
  });
});
