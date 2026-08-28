import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { dayNightLighting } from "./dayNightCycle";
import { shadowCameraFrustum } from "./shadowConfig";
import { partitionBioCityPrimitives } from "./bioCityRenderLayers";
import type { BioCityRenderPlan } from "./bioCityRenderPlan";
import type { BioCityViewportOverlayPlan } from "./bioCityViewportOverlayPlan";
import type { ViewMode } from "./simulationViewportTypes";
import {
  createBioCityAssetPlaceholder,
  createBioCityPrimitiveMesh,
  createBioCitySceneDressingObjects,
} from "./simulationViewportPrimitiveMeshes";
import {
  createBioCityOverlayObjects,
  createBioCityWeatherObjects,
} from "./simulationViewportOverlayMeshes";

export function createFloor(scene: CrowdSimScene | undefined, viewMode: ViewMode) {
  const geometry = new PlaneGeometry(
    (scene?.world.width ?? 80) * 1.08,
    (scene?.world.height ?? 48) * 1.08,
  );
  // 3d ground takes the scene light so it darkens at night with everything
  // else; 2d (top-down, unlit) keeps a flat colour.
  const material =
    viewMode === "3d"
      ? new MeshStandardMaterial({ color: "#eef4f8", roughness: 0.96 })
      : new MeshBasicMaterial({ color: "#f7fbfd" });
  const floor = new Mesh(geometry, material);

  floor.receiveShadow = viewMode === "3d";
  floor.position.set(0, 0, -0.02);

  return floor;
}

export function createWall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  viewMode: ViewMode,
) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const height = viewMode === "3d" ? 2.4 : 0.04;
  const geometry = new BoxGeometry(length, thickness, height);
  const material = new MeshBasicMaterial({ color: "#9aa9b6" });
  const wall = new InstancedMesh(geometry, material, 1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const matrix = new Matrix4();

  matrix.makeRotationZ(angle);
  matrix.setPosition((x1 + x2) / 2, (y1 + y2) / 2, height / 2);
  wall.setMatrixAt(0, matrix);

  return wall;
}

// Split of the former `createBioCityObjects`. Everything that does not read the
// simulation clock or the heatmap belongs to the structural layer and is built
// once per scene; the rest is rebuilt every few simulated seconds.
export function createBioCityStaticObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
  plan: BioCityRenderPlan,
) {
  return [
    ...partitionBioCityPrimitives(plan.primitives).static.map((primitive) =>
      createBioCityPrimitiveMesh(primitive, scene, viewMode),
    ),
    ...plan.assets.map((asset) =>
      createBioCityAssetPlaceholder(asset, scene, viewMode),
    ),
    ...createBioCitySceneDressingObjects(scene, viewMode),
  ];
}

export function createBioCityDynamicObjects(
  scene: CrowdSimScene,
  viewMode: ViewMode,
  plan: BioCityRenderPlan,
  overlayPlan?: BioCityViewportOverlayPlan,
): Object3D[] {
  return [
    ...createBioCityOverlayObjects(scene, viewMode, overlayPlan),
    // Hazard tint/opacity follow the active-hazard schedule, so hazards are
    // time-varying even though the other primitives are not.
    ...partitionBioCityPrimitives(plan.primitives).dynamic.map((primitive) =>
      createBioCityPrimitiveMesh(primitive, scene, viewMode),
    ),
    ...createBioCityWeatherObjects(scene, viewMode, plan),
  ];
}

export function bioCityBackgroundColor(plan: BioCityRenderPlan) {
  if (plan.weather.fogDensity > 0) {
    return "#edf4f8";
  }

  return plan.weather.precipitationIntensity > 0 ? "#eaf2f7" : "#f6f9fc";
}

// Lighting follows the simulation clock (day -> night -> day) so the 3d city
// reads as living. Agents self-illuminate (emissive) and stay visible at night.
export function createDayNightLights(
  scene: CrowdSimScene,
  elapsedSeconds: number,
): Object3D[] {
  const worldWidth = scene.world.width;
  const worldHeight = scene.world.height;
  const lighting = dayNightLighting(elapsedSeconds);
  const hemisphereLight = new HemisphereLight(
    lighting.hemiSky,
    lighting.hemiGround,
    lighting.hemiIntensity,
  );
  const keyLight = new DirectionalLight(lighting.keyColor, lighting.keyIntensity);
  keyLight.position.set(worldWidth * 0.3, -worldHeight * 0.35, worldHeight);
  // Cast real sun shadows so buildings/trees ground themselves instead of
  // floating; the ortho shadow camera covers the whole world footprint.
  keyLight.castShadow = true;
  const shadow = shadowCameraFrustum(worldWidth, worldHeight);
  keyLight.shadow.camera.left = shadow.left;
  keyLight.shadow.camera.right = shadow.right;
  keyLight.shadow.camera.top = shadow.top;
  keyLight.shadow.camera.bottom = shadow.bottom;
  keyLight.shadow.camera.near = shadow.near;
  keyLight.shadow.camera.far = shadow.far;
  keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
  keyLight.shadow.bias = -0.0005;
  const fillLight = new AmbientLight("#ffffff", lighting.ambientIntensity);

  return [hemisphereLight, keyLight, fillLight];
}
export function disposeRenderObject(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    materials.forEach((material) => material.dispose());
  });
}
