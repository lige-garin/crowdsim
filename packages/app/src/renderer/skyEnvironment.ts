import {
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  Euler,
  SRGBColorSpace,
} from "three";

/**
 * The sky the city reflects.
 *
 * Every material in the 3D view sets roughness, metalness and clearcoat, but the
 * scene had no environment, so there was nothing to reflect: glass pavilions,
 * wet asphalt and metal all rendered as flat paint. This is a small painted
 * equirectangular sky — zenith, horizon and ground bands in the day/night
 * palette — used as `scene.environment`, so those parameters do something.
 *
 * It is a gradient only, with no sun disc. The WebGPU and WebGL renderers
 * mirror environment maps horizontally relative to each other, which does not
 * matter for a sky that is the same in every direction around.
 */
export type SkyColours = {
  /** Straight up. */
  zenith: string;
  /** Along the horizon: lighter, hazier. */
  horizon: string;
  /** Below the horizon: what the ground bounces back. */
  ground: string;
};

/**
 * The renderers treat y as up for environment maps; this scene is z-up. Turning
 * the map a quarter-turn about x puts its sky overhead.
 */
export const skyEnvironmentRotation = new Euler(Math.PI / 2, 0, 0);

export function skyColoursFor(options: {
  groundColour: string;
  skyColour: string;
  /** 0 clear .. 1 fully overcast: pulls zenith and horizon toward grey. */
  overcast: number;
}): SkyColours {
  const grey = new Color("#8f989c");
  const sky = new Color(options.skyColour);
  const zenith = sky
    .clone()
    .multiplyScalar(0.82)
    .lerp(grey, options.overcast * 0.7);
  const horizon = sky
    .clone()
    .lerp(new Color("#ffffff"), 0.35)
    .lerp(grey, options.overcast * 0.6);
  const ground = new Color(options.groundColour).lerp(new Color("#6b6660"), 0.5);
  return {
    ground: `#${ground.getHexString()}`,
    horizon: `#${horizon.getHexString()}`,
    zenith: `#${zenith.getHexString()}`,
  };
}

export function createSkyEnvironment() {
  const canvas =
    typeof document === "undefined" ? null : document.createElement("canvas");
  const context = canvas?.getContext("2d") ?? null;
  if (!canvas || !context) {
    // jsdom and workers: no canvas, no environment; materials stay unlit by it.
    const update: (colours: SkyColours) => void = () => {};
    return { dispose() {}, texture: null, update };
  }
  canvas.width = 64;
  canvas.height = 32;
  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  let painted = "";

  function update(colours: SkyColours) {
    const key = `${colours.zenith}${colours.horizon}${colours.ground}`;
    if (key === painted) return;
    painted = key;
    // Row 0 is straight up, the middle row the horizon, the last straight down.
    const gradient = context!.createLinearGradient(0, 0, 0, canvas!.height);
    gradient.addColorStop(0, colours.zenith);
    gradient.addColorStop(0.47, colours.horizon);
    gradient.addColorStop(0.53, colours.ground);
    gradient.addColorStop(1, colours.ground);
    context!.fillStyle = gradient;
    context!.fillRect(0, 0, canvas!.width, canvas!.height);
    texture.needsUpdate = true;
  }

  return {
    dispose: () => texture.dispose(),
    texture,
    update,
  };
}
