import { Group, InstancedMesh } from "three";
import { viewportLayerOfObjectName, type ViewportLayers } from "./viewportLayers";

export function applyViewportLayers(
  dynamicGroup: Group | null,
  crowdMesh: InstancedMesh | null,
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
