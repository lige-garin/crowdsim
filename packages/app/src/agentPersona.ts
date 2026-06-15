export type AgentPersona =
  | "browser"
  | "commuter"
  | "family"
  | "goalBuyer"
  | "luxuryBuyer"
  | "serviceSeeker";

export type AgentIntent =
  | "avoidCrowd"
  | "browseFashion"
  | "buyCoffee"
  | "eatMeal"
  | "evacuate"
  | "goToExit"
  | "meetCompanion"
  | "seekService";

export type AgentTraitProfile = {
  brandLoyalty: number;
  budget: number;
  curiosity: number;
  patience: number;
  riskAvoidance: number;
  sociality: number;
  timePressure: number;
};

export type AgentIntentWeight = {
  intent: AgentIntent;
  weight: number;
};

export type AgentMindset = {
  currentIntent: AgentIntent;
  id: number;
  intentWeights: AgentIntentWeight[];
  persona: AgentPersona;
  traits: AgentTraitProfile;
};

type PersonaDefinition = {
  intents: AgentIntentWeight[];
  traits: AgentTraitProfile;
};

export const personaDefinitions: Record<AgentPersona, PersonaDefinition> = {
  browser: {
    intents: [
      { intent: "browseFashion", weight: 0.86 },
      { intent: "buyCoffee", weight: 0.45 },
      { intent: "eatMeal", weight: 0.35 },
    ],
    traits: trait({ curiosity: 0.86, patience: 0.58, sociality: 0.52 }),
  },
  commuter: {
    intents: [
      { intent: "buyCoffee", weight: 0.72 },
      { intent: "goToExit", weight: 0.7 },
      { intent: "avoidCrowd", weight: 0.58 },
    ],
    traits: trait({ budget: 0.52, patience: 0.34, timePressure: 0.82 }),
  },
  family: {
    intents: [
      { intent: "eatMeal", weight: 0.72 },
      { intent: "meetCompanion", weight: 0.7 },
      { intent: "buyCoffee", weight: 0.38 },
    ],
    traits: trait({ patience: 0.64, riskAvoidance: 0.62, sociality: 0.82 }),
  },
  goalBuyer: {
    intents: [
      { intent: "browseFashion", weight: 0.56 },
      { intent: "goToExit", weight: 0.42 },
      { intent: "avoidCrowd", weight: 0.32 },
    ],
    traits: trait({ brandLoyalty: 0.7, budget: 0.68, timePressure: 0.44 }),
  },
  luxuryBuyer: {
    intents: [
      { intent: "browseFashion", weight: 0.82 },
      { intent: "meetCompanion", weight: 0.34 },
      { intent: "eatMeal", weight: 0.28 },
    ],
    traits: trait({ brandLoyalty: 0.9, budget: 0.92, curiosity: 0.58 }),
  },
  serviceSeeker: {
    intents: [
      { intent: "seekService", weight: 0.9 },
      { intent: "goToExit", weight: 0.52 },
      { intent: "avoidCrowd", weight: 0.44 },
    ],
    traits: trait({ patience: 0.5, riskAvoidance: 0.76, timePressure: 0.58 }),
  },
};

const personaOrder = Object.keys(personaDefinitions) as AgentPersona[];

export function createAgentMindset(options: {
  agentId: number;
  evacuationActive?: boolean;
  seed: number;
}): AgentMindset {
  const persona = pickPersona(options.agentId, options.seed);
  const definition = personaDefinitions[persona];
  const traits = jitterTraits(definition.traits, options.agentId, options.seed);
  const intentWeights = normalizeIntentWeights(definition.intents, traits);

  return {
    currentIntent: options.evacuationActive
      ? "evacuate"
      : pickCurrentIntent(intentWeights, traits),
    id: options.agentId,
    intentWeights,
    persona,
    traits,
  };
}

export function createAgentCohort(options: {
  count: number;
  evacuationActive?: boolean;
  seed: number;
}): AgentMindset[] {
  return Array.from({ length: options.count }, (_, index) =>
    createAgentMindset({
      agentId: index + 1,
      evacuationActive: options.evacuationActive,
      seed: options.seed,
    }),
  );
}

export function intentWeight(
  mindset: Pick<AgentMindset, "intentWeights">,
  intent: AgentIntent,
) {
  return (
    mindset.intentWeights.find((candidate) => candidate.intent === intent)?.weight ?? 0
  );
}

function trait(overrides: Partial<AgentTraitProfile>): AgentTraitProfile {
  return {
    brandLoyalty: 0.45,
    budget: 0.5,
    curiosity: 0.48,
    patience: 0.5,
    riskAvoidance: 0.42,
    sociality: 0.45,
    timePressure: 0.42,
    ...overrides,
  };
}

function pickPersona(agentId: number, seed: number): AgentPersona {
  return personaOrder[(hashUnit(agentId, seed, 13) * personaOrder.length) << 0];
}

function jitterTraits(
  baseTraits: AgentTraitProfile,
  agentId: number,
  seed: number,
): AgentTraitProfile {
  return Object.fromEntries(
    Object.entries(baseTraits).map(([key, value], index) => [
      key,
      clamp01(value + (hashUnit(agentId, seed, index) - 0.5) * 0.12),
    ]),
  ) as AgentTraitProfile;
}

function normalizeIntentWeights(
  intents: readonly AgentIntentWeight[],
  traits: AgentTraitProfile,
) {
  return intents
    .map((intent) => ({
      ...intent,
      weight: clamp01(intent.weight + intentTraitBoost(intent.intent, traits)),
    }))
    .sort((left, right) => right.weight - left.weight);
}

function intentTraitBoost(intent: AgentIntent, traits: AgentTraitProfile) {
  if (intent === "goToExit") {
    return traits.timePressure * 0.18;
  }

  if (intent === "browseFashion") {
    return traits.curiosity * 0.12 + traits.brandLoyalty * 0.08;
  }

  if (intent === "meetCompanion") {
    return traits.sociality * 0.16;
  }

  if (intent === "avoidCrowd") {
    return traits.riskAvoidance * 0.14 - traits.patience * 0.05;
  }

  return 0;
}

function pickCurrentIntent(
  intentWeights: readonly AgentIntentWeight[],
  traits: AgentTraitProfile,
): AgentIntent {
  const exitIntent = intentWeights.find((intent) => intent.intent === "goToExit");

  if (exitIntent && traits.timePressure > 0.78 && exitIntent.weight > 0.72) {
    return "goToExit";
  }

  return intentWeights[0]?.intent ?? "goToExit";
}

function hashUnit(agentId: number, seed: number, salt: number) {
  const value = Math.sin(agentId * 92821 + seed * 68917 + salt * 193) * 10000;

  return value - Math.floor(value);
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
