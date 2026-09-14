import type { Group, Object3D } from "three";
import { viewportLayerOfObjectName, type ViewportLayers } from "./viewportLayers";

export function applyViewportLayers(
  dynamicGroup: Group | null,
  crowdMesh: Object3D | null,
  layers: ViewportLayers,
) {
  if (crowdMesh) {
    crowdMesh.visible = layers.crowd;
  }
  dynamicGroup?.children.forEach((child) => {
    const layer = viewportLayerOfObjectName(child.name);
    if (layer) {
      child.visible = layers[layer];
    }
  });
}
