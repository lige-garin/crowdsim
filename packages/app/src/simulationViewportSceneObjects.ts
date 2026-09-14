import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  Light,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
} from "three";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  CITY_DAY_LENGTH_SECONDS,
  dayNightLighting,
  sunDirection,
  sunLevel,
} from "./dayNightCycle";
import {
  createSkyEnvironment,
  skyColoursFor,
  skyEnvironmentRotation,
} from "./skyEnvironment";
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

// Start the city mid-morning rather than at midnight.
const BIOCITY_LOCAL_DAY_OFFSET_SECONDS = CITY_DAY_LENGTH_SECONDS * 0.32;

const cityLighting = (elapsedSeconds: number) =>
  dayNightLighting(elapsedSeconds + BIOCITY_LOCAL_DAY_OFFSET_SECONDS);

/** 0 in daylight, 1 at night — drives lit windows and street lamps. */
export function cityNightLevel(elapsedSeconds: number) {
  const sun = sunLevel(elapsedSeconds + BIOCITY_LOCAL_DAY_OFFSET_SECONDS);
  return MathUtils.clamp((0.45 - sun) / 0.35, 0, 1);
}

/** The flat top-down floor. The 3D city brings its own ground (cityMeshes). */
export function createFloor(scene: CrowdSimScene) {
  const floor = new Mesh(
    new PlaneGeometry(scene.world.width * 1.08, scene.world.height * 1.08),
    new MeshBasicMaterial({ color: "#f7fbfd" }),
  );
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
  // Lit and shadowed in 3D: an unlit wall was the one flat grey slab in a city
  // where everything else takes the light.
  const material =
    viewMode === "3d"
      ? new MeshStandardMaterial({ color: "#b8bec3", roughness: 0.82 })
      : new MeshBasicMaterial({ color: "#9aa9b6" });
  const wall = new InstancedMesh(geometry, material, 1);
  wall.castShadow = viewMode === "3d";
  wall.receiveShadow = viewMode === "3d";
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
  // In 3D the generated city (cityMeshes) owns buildings, trees and lamps, and
  // the baked streetscape scene is superseded by it. Drawing the plan's
  // building boxes as well would put an opaque copy of every district building
  // over the glass pavilions and hide the crowd inside them.
  const is3d = viewMode === "3d";
  return [
    ...partitionBioCityPrimitives(plan.primitives)
      .static.filter((primitive) => !is3d || primitive.kind !== "building")
      .map((primitive) => createBioCityPrimitiveMesh(primitive, scene, viewMode)),
    ...plan.assets
      .filter((asset) => !is3d || asset.kind !== "gltf-scene")
      .map((asset) => createBioCityAssetPlaceholder(asset, scene, viewMode)),
    ...(is3d ? [] : createBioCitySceneDressingObjects(scene, viewMode)),
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

export function bioCityAtmosphere(plan: BioCityRenderPlan, elapsedSeconds = 0) {
  const lighting = cityLighting(elapsedSeconds);
  const precipitation = MathUtils.clamp(plan.weather.precipitationIntensity, 0, 1);
  const fogOpacity = MathUtils.clamp(plan.weather.fogOpacity, 0, 1);
  // Rain greys the sky, but only partly: at full strength it flattened the
  // whole city into one overcast tone.
  const weatherMix = MathUtils.clamp(precipitation * 0.22 + fogOpacity * 0.6, 0, 1);
  const overcast = new Color(plan.weather.fogDensity > 0 ? "#7e898d" : "#89979d");
  const background = new Color(lighting.hemiSky).lerp(overcast, weatherMix);

  return {
    background: `#${background.getHexString()}`,
    /** 0 clear .. 1 fully overcast, for the reflected sky. */
    overcast: weatherMix,
    // Always some aerial haze: it is what gives a city depth, and it softens
    // the generated blocks into the horizon instead of ending at a hard edge.
    fogDensity: 0.0011 + fogOpacity * 0.02 + precipitation * 0.0005,
  };
}

export function applyBioCityAtmosphere(
  renderScene: Scene,
  plan: BioCityRenderPlan,
  elapsedSeconds: number,
  viewMode: ViewMode,
) {
  if (viewMode !== "3d") {
    renderScene.background = new Color("#f2f4f1");
    renderScene.fog = null;
    return;
  }

  const atmosphere = bioCityAtmosphere(plan, elapsedSeconds);
  renderScene.background = new Color(atmosphere.background);
  renderScene.fog =
    atmosphere.fogDensity > 0
      ? new FogExp2(atmosphere.background, atmosphere.fogDensity)
      : null;
}

// Lighting follows the simulation clock (day -> night -> day) so the 3d city
// reads as living. Agents self-illuminate (emissive) and stay visible at night.
//
// The lights are created once per viewport and only re-tuned as the clock
// moves. They used to be rebuilt on every time-varying update (heatmap samples
// arrive every simulated second), and the key light's 4096² shadow map was
// never disposed — tens of megabytes of GPU memory orphaned each second.
export function createDayNightRig(world: { height: number; width: number }) {
  const worldWidth = world.width;
  const worldHeight = world.height;
  const hemisphereLight = new HemisphereLight();
  const keyLight = new DirectionalLight();
  keyLight.castShadow = true;
  // Shadows cover the district and the first ring of downtown around it.
  const shadow = shadowCameraFrustum(worldWidth + 220, worldHeight + 220);
  const sunDistance = Math.hypot(worldWidth + 220, worldHeight + 220) * 0.75;
  const sky = createSkyEnvironment();
  let attachedScene: Scene | null = null;
  keyLight.shadow.camera.left = shadow.left;
  keyLight.shadow.camera.right = shadow.right;
  keyLight.shadow.camera.top = shadow.top;
  keyLight.shadow.camera.bottom = shadow.bottom;
  keyLight.shadow.camera.near = shadow.near;
  keyLight.shadow.camera.far = shadow.far;
  keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
  keyLight.shadow.bias = -0.0005;
  const fillLight = new AmbientLight("#ffffff");

  /**
   * @param overcast 0 clear .. 1 overcast (weather), greying the reflected sky.
   */
  function setTime(elapsedSeconds: number, overcast = 0) {
    const clock = elapsedSeconds + BIOCITY_LOCAL_DAY_OFFSET_SECONDS;
    const lighting = cityLighting(elapsedSeconds);
    const sun = sunLevel(clock);
    // The reflected sky now lights every surface as well, so the flat fills
    // give up the share it covers or the city washes out.
    hemisphereLight.color.set(lighting.hemiSky);
    hemisphereLight.groundColor.set(lighting.hemiGround);
    hemisphereLight.intensity = lighting.hemiIntensity * 0.6;
    keyLight.color.set(lighting.keyColor);
    keyLight.intensity = lighting.keyIntensity;
    fillLight.intensity = lighting.ambientIntensity * 0.45;
    const direction = sunDirection(clock);
    keyLight.position.set(
      direction.x * sunDistance,
      direction.y * sunDistance,
      direction.z * sunDistance,
    );
    sky.update(
      skyColoursFor({
        groundColour: lighting.hemiGround,
        overcast,
        skyColour: lighting.hemiSky,
      }),
    );
    if (attachedScene) attachedScene.environmentIntensity = 0.2 + sun * 0.7;
  }

  return {
    /** Adds the lights and the reflected sky to the scene. */
    attach(scene: Scene) {
      attachedScene = scene;
      scene.add(hemisphereLight, keyLight, fillLight);
      scene.environment = sky.texture;
      scene.environmentRotation.copy(skyEnvironmentRotation);
      setTime(0);
    },
    dispose() {
      if (attachedScene?.environment === sky.texture) attachedScene.environment = null;
      attachedScene = null;
      sky.dispose();
      hemisphereLight.dispose();
      keyLight.dispose();
      fillLight.dispose();
    },
    setTime,
  };
}

export function disposeRenderObject(object: Object3D) {
  object.traverse((child) => {
    // A shadow-casting light owns a render target; removing it from the scene
    // does not free that.
    if (child instanceof Light) {
      child.dispose();
      return;
    }
    if (!(child instanceof Mesh)) {
      return;
    }

    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    materials.forEach((material) => material.dispose());
  });
}
