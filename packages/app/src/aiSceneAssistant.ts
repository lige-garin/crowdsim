import { parseScene, safeParseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

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

export type SceneAssistantValidationAttempt = {
  error?: string;
  ok: boolean;
  responseIndex: number;
};

export type SceneAssistantValidationResult =
  | {
      attempts: readonly SceneAssistantValidationAttempt[];
      scene: CrowdSimScene;
      status: "accepted";
    }
  | {
      attempts: readonly SceneAssistantValidationAttempt[];
      retryPrompt: string;
      scene: null;
      status: "retry-required";
    };

export const sceneAssistantJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "name", "world"],
  properties: {
    schemaVersion: { type: "string", enum: ["1.0.0"] },
    id: { type: "string" },
    name: { type: "string" },
    world: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height"],
      properties: {
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    walls: { type: "array", items: { type: "object" } },
    entrances: { type: "array", items: { type: "object" } },
    areas: { type: "array", items: { type: "object" } },
    targets: { type: "array", items: { type: "object" } },
    shops: { type: "array", items: { type: "object" } },
    servicePoints: { type: "array", items: { type: "object" } },
    countLines: { type: "array", items: { type: "object" } },
  },
} as const;

export function createClaudeSceneAssistantRequest(options: {
  model?: string;
  prompt: string;
}) {
  return {
    model: options.model ?? "claude-sonnet-4-6",
    max_tokens: 4096,
    system:
      "Generate one valid CrowdSim .csim.json scene. Use metric coordinates, concise ids, and realistic entrances, walls, shops, service points, and count lines.",
    messages: [
      {
        role: "user",
        content: options.prompt,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: sceneAssistantJsonSchema,
      },
    },
  };
}

export function parseSceneAssistantResponse(text: string): CrowdSimScene {
  return parseScene(JSON.parse(text));
}

export function validateSceneAssistantResponses(options: {
  maxAttempts?: number;
  prompt: string;
  responses: readonly string[];
}): SceneAssistantValidationResult {
  const attempts: SceneAssistantValidationAttempt[] = [];
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

  for (const [responseIndex, response] of options.responses
    .slice(0, maxAttempts)
    .entries()) {
    const parsedJson = parseJsonResponse(response);

    if (!parsedJson.ok) {
      attempts.push({ error: parsedJson.error, ok: false, responseIndex });
      continue;
    }

    const parsedScene = safeParseScene(parsedJson.value);

    if (parsedScene.success) {
      attempts.push({ ok: true, responseIndex });
      return {
        attempts,
        scene: parsedScene.data,
        status: "accepted",
      };
    }

    attempts.push({
      error: parsedScene.error.issues.map((issue) => issue.message).join("; "),
      ok: false,
      responseIndex,
    });
  }

  return {
    attempts,
    retryPrompt: createSceneAssistantRetryPrompt(
      options.prompt,
      attempts.at(-1)?.error ?? "Unknown validation error",
    ),
    scene: null,
    status: "retry-required",
  };
}

export function createLocalSceneAssistantDraft(
  prompt: string,
  baseScene: CrowdSimScene,
): CrowdSimScene {
  const mallMode = prompt.toLowerCase().includes("mall");

  return parseScene({
    ...baseScene,
    id: `${baseScene.id}-ai-draft`,
    name: mallMode ? "AI Mall Draft" : "AI Scene Draft",
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
    name: "AI Hospital Draft",
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

function createSceneAssistantRetryPrompt(prompt: string, error: string) {
  return [
    "Regenerate one valid CrowdSim scene JSON.",
    "Keep the original user intent.",
    `Original prompt: ${prompt}`,
    `Previous validation failed against the CrowdSim scene schema: ${error}`,
  ].join("\n");
}

function parseJsonResponse(
  response: string,
): { ok: true; value: unknown } | { error: string; ok: false } {
  try {
    return { ok: true, value: JSON.parse(response) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid JSON",
      ok: false,
    };
  }
}

function createStationDraft(baseScene: CrowdSimScene) {
  return parseScene({
    ...baseScene,
    id: `${baseScene.id}-station-ai-draft`,
    name: "AI Station Draft",
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
