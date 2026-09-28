import { describe, expect, it } from "vitest";
import {
  createLocalSceneAssistantDraft,
  createNaturalLanguageScenePlanDraft,
} from "./aiSceneAssistant";
import { demoScene } from "../scenes/demoScene";

describe("AI scene assistant", () => {
  it("creates a local draft with commercial objects for browser demos", () => {
    const scene = createLocalSceneAssistantDraft("mall", demoScene);

    expect(scene.id).toBe("atrium-demo-ai-draft");
    expect(scene.name).toBe("Mall Template Draft");
    expect(scene.shops).toHaveLength(2);
    expect(scene.servicePoints[0].kind).toBe("gate");
    expect(scene.countLines).toHaveLength(1);
  });

  it("turns hospital and station prompts into deterministic scene plans", () => {
    const hospital = createNaturalLanguageScenePlanDraft(
      "医院门诊，医生会看病人，等待区需要疏散演练",
      demoScene,
    );
    const station = createNaturalLanguageScenePlanDraft(
      "train station platform with arrival surge",
      demoScene,
    );

    expect(hospital.scene.id).toBe("atrium-demo-hospital-ai-draft");
    expect(hospital.scene.servicePoints.map((point) => point.id)).toContain(
      "ai-triage-counter",
    );
    expect(hospital.events.map((event) => event.kind)).toContain("evacuation");
    expect(station.scene.id).toBe("atrium-demo-station-ai-draft");
    expect(station.events[0]).toMatchObject({
      kind: "arrival-surge",
      targetId: "ai-platform-entry",
    });
  });
});
