import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  type BufferAttribute,
  type Object3D,
} from "three";
import type { ScenePoint } from "@crowdsim/scene-schema";

/**
 * The rubber-band line a count line's drag tool previews while it is being
 * drawn in the 3D view (ADR-0031) — the render-space mirror of
 * `SceneEditorLines.tsx`'s own `<polyline class="draft">` in the 2D editor.
 * Two vertices only, moved in place every frame rather than a new geometry
 * per update, the same "mutate, don't reallocate" discipline the rest of
 * this renderer already holds for anything touched every pointer move.
 */
export function attachCountLineDraft(parent: Object3D) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
  const material = new LineBasicMaterial({ color: 0xffcc33 });
  const line = new Line(geometry, material);
  line.name = "count-line-draft";
  line.visible = false;
  line.renderOrder = 11;
  line.frustumCulled = false;
  parent.add(line);

  const setEnd = (
    index: 0 | 1,
    point: ScenePoint,
    world: { width: number; height: number },
  ) => {
    const position = geometry.attributes.position as BufferAttribute;
    // Scene y-down to render y-up, world-centred — the same conversion
    // `placementGhost.ts` already applies to its own ghost position.
    position.setXYZ(index, point.x - world.width / 2, world.height / 2 - point.y, 0.2);
  };

  return {
    show(start: ScenePoint, end: ScenePoint, world: { width: number; height: number }) {
      setEnd(0, start, world);
      setEnd(1, end, world);
      (geometry.attributes.position as BufferAttribute).needsUpdate = true;
      line.visible = true;
    },
    hide() {
      line.visible = false;
    },
    dispose() {
      parent.remove(line);
      geometry.dispose();
      material.dispose();
    },
  };
}
