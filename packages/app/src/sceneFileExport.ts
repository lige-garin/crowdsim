import type { CrowdSimScene } from "@crowdsim/scene-schema";

export function downloadSceneJson(scene: CrowdSimScene) {
  const blob = new Blob([JSON.stringify(scene, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");

  anchor.href = url;
  anchor.download = `${scene.id}.csim.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
