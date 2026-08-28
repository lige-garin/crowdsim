export type AiPayloadPolicy = {
  allowedModels: readonly string[];
  maxOutputTokens: number;
};

export type AiPayloadRejection = {
  error: string;
  message: string;
};

/**
 * The proxy spends the operator's provider credit, so the caller may not pick
 * the model or the output budget freely: both are the cost knobs.
 */
export const defaultAiPayloadPolicy: AiPayloadPolicy = {
  allowedModels: [
    "claude-haiku-4-5",
    "claude-opus-4-1",
    "claude-sonnet-4-6",
    "gpt-4.1-mini",
    "gpt-4o-mini",
  ],
  maxOutputTokens: 8192,
};

const outputTokenFields = ["max_tokens", "max_output_tokens"] as const;

export function checkAiPayload(
  payload: unknown,
  policy: AiPayloadPolicy,
): AiPayloadRejection | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      error: "ai-payload-invalid",
      message: "AI proxy payload must be a JSON object.",
    };
  }

  const fields = payload as Record<string, unknown>;
  const model = fields.model;

  if (typeof model !== "string" || !policy.allowedModels.includes(model)) {
    return {
      error: "ai-model-not-allowed",
      message: `AI proxy payload must use one of: ${policy.allowedModels.join(", ")}.`,
    };
  }

  const budgetField = outputTokenFields.find((field) => field in fields);

  if (!budgetField) {
    return {
      error: "ai-max-tokens-missing",
      message: "AI proxy payload must declare max_tokens or max_output_tokens.",
    };
  }

  const budget = fields[budgetField];

  if (
    typeof budget !== "number" ||
    !Number.isInteger(budget) ||
    budget < 1 ||
    budget > policy.maxOutputTokens
  ) {
    return {
      error: "ai-max-tokens-not-allowed",
      message: `Field '${budgetField}' must be an integer between 1 and ${policy.maxOutputTokens}.`,
    };
  }

  return null;
}
