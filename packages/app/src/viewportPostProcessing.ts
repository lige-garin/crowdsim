import type { Camera, Scene } from "three";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";
import {
  emissive,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  vec3,
  vec4,
} from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { fxaa } from "three/examples/jsm/tsl/display/FXAANode.js";

/**
 * The finishing pass for the 3D city on WebGPU: ambient occlusion, a glow on
 * what emits light, and anti-aliasing.
 *
 * - Ambient occlusion darkens creases — where a wall meets the pavement, under
 *   a fascia, between people in a crowd — which is most of what makes a
 *   rendered scene read as solid rather than as floating boxes.
 * - Bloom is selective: only the emissive channel feeds it, so shop signs,
 *   street lamps and lit windows glow at night while daylight surfaces do not
 *   haze over.
 * - FXAA runs last on the tone-mapped image, because the scene is rendered to
 *   an off-screen target that the renderer's own MSAA does not reach.
 *
 * WebGPU only: the WebGL compatibility renderer, already labelled as such
 * (ADR-0006), renders without this pass.
 */
const postProcessingSettings = {
  /** Occlusion radius, metres in view space. */
  aoRadius: 1.2,
  /** Occlusion at half resolution: the effect is soft and this halves its cost. */
  aoResolutionScale: 0.5,
  bloomStrength: 0.55,
  bloomRadius: 0.35,
  bloomThreshold: 0.2,
} as const;

export function createViewportPostProcessing(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
) {
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ emissive, normal: normalView, output }));
  const colour = scenePass.getTextureNode("output");
  const aoPass = ao(
    scenePass.getTextureNode("depth"),
    scenePass.getTextureNode("normal"),
    camera,
  );
  aoPass.resolutionScale = postProcessingSettings.aoResolutionScale;
  aoPass.radius.value = postProcessingSettings.aoRadius;
  const occluded = colour.mul(vec4(vec3(aoPass.getTextureNode().r), 1));
  const glow = bloom(
    scenePass.getTextureNode("emissive"),
    postProcessingSettings.bloomStrength,
    postProcessingSettings.bloomRadius,
    postProcessingSettings.bloomThreshold,
  );

  const pipeline = new RenderPipeline(renderer);
  // Tone map and convert to sRGB before FXAA, which expects display colours.
  pipeline.outputColorTransform = false;
  pipeline.outputNode = fxaa(renderOutput(occluded.add(glow)));

  return {
    render: () => pipeline.render(),
    dispose() {
      aoPass.dispose();
      glow.dispose();
      pipeline.dispose();
    },
  };
}
