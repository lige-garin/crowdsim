import { PerspectiveCamera } from "three";
import { afterEach, describe, expect, it } from "vitest";
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
  const rig = initialCityCameraRig();
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
});
