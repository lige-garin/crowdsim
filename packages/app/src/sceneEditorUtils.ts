import type { ScenePoint } from "@crowdsim/scene-schema";

export { clamp } from "./numberUtils";

export function pointsToSvg(points: ScenePoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("File did not produce a data URL"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
