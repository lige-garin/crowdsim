import { describe, expect, it } from "vitest";
import {
  createClaudeSceneAssistantRequest,
  createLocalSceneAssistantDraft,
  createNaturalLanguageScenePlanDraft,
  parseSceneAssistantResponse,
  validateSceneAssistantResponses,
} from "./aiSceneAssistant";
import { demoScene } from "./demoScene";

describe("AI scene assistant", () => {
  it("builds a Claude structured-output request for scene JSON", () => {
    const request = createClaudeSceneAssistantRequest({
      prompt: "Create a compact mall atrium with two shops.",
    });

    expect(request.model).toBe("claude-sonnet-4-6");
    expect(request.messages[0].content).toContain("mall atrium");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.output_config.format.schema.properties.shops.type).toBe("array");
    expect(request.output_config.format.schema.properties.servicePoints.type).toBe(
      "array",
    );
    expect(request.output_config.format.schema.properties.countLines.type).toBe(
      "array",
    );
  });

  it("parses a structured scene response through the canonical schema", () => {
    const scene = parseSceneAssistantResponse(
      JSON.stringify({
        schemaVersion: "1.0.0",
        id: "ai-scene",
        name: "AI Scene",
        world: { width: 24, height: 18 },
      }),
    );

    expect(scene.id).toBe("ai-scene");
    expect(scene.units).toBe("meters");
    expect(scene.shops).toEqual([]);
    expect(scene.servicePoints).toEqual([]);
    expect(scene.countLines).toEqual([]);
  });

  it("validates structured responses and accepts a corrected retry", () => {
    const result = validateSceneAssistantResponses({
      prompt: "Create a station hall.",
      responses: [
        JSON.stringify({ id: "missing-fields" }),
        JSON.stringify({
          schemaVersion: "1.0.0",
          id: "station-hall",
          name: "Station Hall",
          world: { width: 40, height: 24 },
        }),
      ],
    });

    expect(result.status).toBe("accepted");
    expect(result.attempts).toHaveLength(2);
    expect(result.scene?.id).toBe("station-hall");
  });

  it("returns a retry prompt when all responses fail schema validation", () => {
    const result = validateSceneAssistantResponses({
      maxAttempts: 2,
      prompt: "Create a compact clinic.",
      responses: ["not json", JSON.stringify({ schemaVersion: "1.0.0" })],
    });

    expect(result.status).toBe("retry-required");
    expect(result.scene).toBeNull();
    if (result.status !== "retry-required") {
      throw new Error("Expected retry-required result");
    }
    expect(result.retryPrompt).toContain("CrowdSim scene schema");
    expect(result.retryPrompt).toContain("compact clinic");
  });

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
