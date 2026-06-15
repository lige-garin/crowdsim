import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

export type EditorViewMode = CrowdSimScene["visual"]["defaultView"];

export function toggleEditorViewMode(scene: CrowdSimScene): CrowdSimScene {
  return parseScene({
    ...scene,
    visual: {
      ...scene.visual,
      defaultView: scene.visual.defaultView === "isometric" ? "topDown" : "isometric",
    },
  });
}
