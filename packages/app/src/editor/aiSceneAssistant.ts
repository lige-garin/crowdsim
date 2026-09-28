// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): nothing in this module is AI.
// There is no model, no inference and no natural-language understanding. Every
// entry point is keyword matching over the prompt string -- `includes("mall")`,
// `includes("hospital")` -- selecting one of several hard-coded scene layouts.
// A prompt that matches nothing falls through to the same fixed commercial
// template. The `ai` in the module name and the `ai-*` object ids are historical
// identifiers, not capability claims; the user-facing wording says "template"
// so the UI does not promise a model it does not have. Frozen 2026-08-30: do
// not reintroduce "AI" into user-visible copy until a real model is wired up.
//
// The structured-output request builder and response validator
// (`createClaudeSceneAssistantRequest`/`parseSceneAssistantResponse`/
// `validateSceneAssistantResponses`) that used to live here were deleted
// 2026-09-24 alongside `AiWorkflowPanel.tsx`, their only caller -- they were
// never reached by anything else and had drifted to test-only code the
// moment that panel was removed. What remains below,
// `createNaturalLanguageScenePlanDraft` and its helpers, is the real,
// live path: the scene editor's "模板草稿" button.
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

export type AiSceneEventDraft = {
  atSeconds: number;
  description: string;
  kind: "arrival-surge" | "evacuation" | "service-delay";
  targetId: string;
};

export type AiScenePlanDraft = {
  events: AiSceneEventDraft[];
  scene: CrowdSimScene;
  summary: string;
};

export function createLocalSceneAssistantDraft(
  prompt: string,
  baseScene: CrowdSimScene,
): CrowdSimScene {
  const mallMode = prompt.toLowerCase().includes("mall");

  return parseScene({
    ...baseScene,
    id: `${baseScene.id}-ai-draft`,
    name: mallMode ? "Mall Template Draft" : "Scene Template Draft",
    shops: [
      {
        id: "ai-shop-1",
        position: { x: 24, y: 18 },
        size: { width: 9, height: 5 },
        attraction: mallMode ? 1.4 : 1,
        capacity: 18,
        dwellMeanSeconds: 260,
      },
      {
        id: "ai-shop-2",
        position: { x: 54, y: 28 },
        size: { width: 10, height: 6 },
        attraction: 1.1,
        capacity: 14,
        dwellMeanSeconds: 220,
      },
    ],
    servicePoints: [
      {
        id: "ai-gate-1",
        kind: "gate",
        position: { x: 72, y: 24 },
        width: 4,
        serviceMeanSeconds: 8,
        capacityPerMinute: 140,
      },
    ],
    countLines: [
      {
        id: "ai-count-line-1",
        geometry: {
          type: "polyline",
          points: [
            { x: 36, y: 10 },
            { x: 36, y: 38 },
          ],
        },
      },
    ],
  });
}

export function createNaturalLanguageScenePlanDraft(
  prompt: string,
  baseScene: CrowdSimScene,
): AiScenePlanDraft {
  const normalizedPrompt = prompt.toLowerCase();

  if (normalizedPrompt.includes("hospital") || normalizedPrompt.includes("医院")) {
    const scene = createHospitalDraft(baseScene);

    return {
      events: [
        {
          atSeconds: 120,
          description: "Outpatient queue slows while a doctor reviews a patient.",
          kind: "service-delay",
          targetId: "ai-triage-counter",
        },
        {
          atSeconds: 300,
          description: "Emergency evacuation drill routes visitors to the east exit.",
          kind: "evacuation",
          targetId: "main-exit",
        },
      ],
      scene,
      summary: "Hospital draft with triage, waiting area, and evacuation event.",
    };
  }

  if (
    normalizedPrompt.includes("station") ||
    normalizedPrompt.includes("train") ||
    normalizedPrompt.includes("车站")
  ) {
    const scene = createStationDraft(baseScene);

    return {
      events: [
        {
          atSeconds: 90,
          description: "Train arrival surge increases passenger inflow.",
          kind: "arrival-surge",
          targetId: "ai-platform-entry",
        },
      ],
      scene,
      summary: "Station draft with platform gate, ticket service, and surge event.",
    };
  }

  return {
    events: [],
    scene: createLocalSceneAssistantDraft(prompt, baseScene),
    summary: "Commercial circulation draft generated from local heuristics.",
  };
}

function createHospitalDraft(baseScene: CrowdSimScene) {
  return parseScene({
    ...baseScene,
    id: `${baseScene.id}-hospital-ai-draft`,
    name: "Hospital Template Draft",
    servicePoints: [
      {
        id: "ai-triage-counter",
        kind: "counter",
        position: { x: 22, y: 18 },
        width: 5,
        serviceMeanSeconds: 45,
        capacityPerMinute: 35,
      },
      {
        id: "ai-nurse-station",
        kind: "counter",
        position: { x: 48, y: 18 },
        width: 4,
        serviceMeanSeconds: 30,
        capacityPerMinute: 50,
      },
    ],
    targets: [
      ...baseScene.targets,
      {
        id: "ai-waiting-area",
        position: { x: 34, y: 30 },
        radius: 4,
      },
    ],
  });
}

function createStationDraft(baseScene: CrowdSimScene) {
  return parseScene({
    ...baseScene,
    id: `${baseScene.id}-station-ai-draft`,
    name: "Station Template Draft",
    entrances: [
      ...baseScene.entrances,
      {
        id: "ai-platform-entry",
        kind: "source",
        position: { x: 8, y: 42 },
        width: 7,
        arrivalRatePerMinute: 220,
      },
    ],
    servicePoints: [
      {
        id: "ai-ticket-gate",
        kind: "gate",
        position: { x: 40, y: 24 },
        width: 8,
        serviceMeanSeconds: 6,
        capacityPerMinute: 180,
      },
    ],
    countLines: [
      {
        id: "ai-platform-count-line",
        geometry: {
          type: "polyline",
          points: [
            { x: 58, y: 8 },
            { x: 58, y: 42 },
          ],
        },
      },
    ],
  });
}
