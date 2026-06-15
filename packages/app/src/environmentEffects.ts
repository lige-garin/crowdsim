import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import type { BenchmarkScenario } from "./benchmarkTypes";
import type { ExperimentDefinition } from "./experimentRunner";

type EnvironmentFactor = CrowdSimScene["environmentFactors"][number];
type EnvironmentFactorInput = Pick<EnvironmentFactor, "kind"> &
  Partial<Omit<EnvironmentFactor, "id" | "kind" | "startsAtSeconds">>;

export type EnvironmentImpact = {
  activeFactorIds: string[];
  routeCostMultiplier: number;
  riskScore: number;
  speedMultiplier: number;
  storeAttractionMultiplier: number;
  visibilityMultiplier: number;
};

export const clearEnvironmentImpact: EnvironmentImpact = {
  activeFactorIds: [],
  riskScore: 0,
  routeCostMultiplier: 1,
  speedMultiplier: 1,
  storeAttractionMultiplier: 1,
  visibilityMultiplier: 1,
};

export function calculateEnvironmentImpact(
  scene: CrowdSimScene,
  elapsedSeconds = 0,
): EnvironmentImpact {
  return scene.environmentFactors
    .filter((factor) => isFactorActive(factor, elapsedSeconds))
    .reduce(applyFactorImpact, clearEnvironmentImpact);
}

export function createEnvironmentComparisonExperiment(
  scenario: BenchmarkScenario,
): ExperimentDefinition {
  return {
    id: `${scenario.id}-environment-comparison`,
    name: `${scenario.name} environment comparison`,
    replications: 2,
    scenario,
    variants: [
      { id: "clear", name: "Clear" },
      ...environmentScenarioPresets(scenario.scene).map((preset) => ({
        id: preset.id,
        name: preset.name,
        scene: preset.scene,
        simulationOverrides: {
          speedMetersPerSecond:
            (scenario.simulation.speedMetersPerSecond ?? 1.34) *
            calculateEnvironmentImpact(preset.scene).speedMultiplier,
        },
      })),
    ],
  };
}

export function environmentScenarioPresets(scene: CrowdSimScene) {
  return [
    createVariantScene(scene, "rain", "Rain", {
      kind: "rain",
      routeCostMultiplier: 1.15,
      severity: 0.4,
      speedMultiplier: 0.88,
      visibilityMultiplier: 0.9,
    }),
    createVariantScene(scene, "fog", "Fog", {
      kind: "fog",
      routeCostMultiplier: 1.22,
      riskScore: 0.12,
      severity: 0.45,
      speedMultiplier: 0.94,
      visibilityMultiplier: 0.55,
    }),
    createVariantScene(scene, "smoke", "Smoke", {
      kind: "smoke",
      routeCostMultiplier: 1.65,
      riskScore: 0.55,
      severity: 0.7,
      speedMultiplier: 0.76,
      visibilityMultiplier: 0.35,
    }),
    createVariantScene(scene, "exitClosed", "Exit closed", {
      kind: "exitClosed",
      routeCostMultiplier: 2.4,
      riskScore: 0.3,
      severity: 0.65,
      speedMultiplier: 0.9,
      targetId: scene.entrances.find((entrance) => entrance.kind !== "source")?.id,
    }),
    createVariantScene(scene, "promotionSurge", "Promotion surge", {
      kind: "promotionSurge",
      routeCostMultiplier: 1.08,
      severity: 0.6,
      speedMultiplier: 0.96,
      behaviorTags: ["brand-attraction", "queue-pressure"],
    }),
  ] as const;
}

function createVariantScene(
  scene: CrowdSimScene,
  id: string,
  name: string,
  factor: EnvironmentFactorInput,
) {
  return {
    id,
    name,
    scene: parseScene({
      ...scene,
      id: `${scene.id}-${id}`,
      name: `${scene.name} / ${name}`,
      environmentFactors: [
        ...scene.environmentFactors,
        {
          id: `env-${id}`,
          startsAtSeconds: 0,
          ...factor,
        },
      ],
    }),
  };
}

function applyFactorImpact(
  impact: EnvironmentImpact,
  factor: EnvironmentFactor,
): EnvironmentImpact {
  const defaults = defaultImpactForKind(factor);

  return {
    activeFactorIds: [...impact.activeFactorIds, factor.id],
    riskScore: clamp01(
      impact.riskScore + Math.max(defaults.riskScore, factor.riskScore),
    ),
    routeCostMultiplier:
      impact.routeCostMultiplier *
      Math.max(defaults.routeCostMultiplier, factor.routeCostMultiplier),
    speedMultiplier:
      impact.speedMultiplier *
      Math.min(defaults.speedMultiplier, factor.speedMultiplier),
    storeAttractionMultiplier:
      impact.storeAttractionMultiplier * storeAttractionMultiplierForFactor(factor),
    visibilityMultiplier:
      impact.visibilityMultiplier *
      Math.min(defaults.visibilityMultiplier, factor.visibilityMultiplier),
  };
}

function defaultImpactForKind(factor: EnvironmentFactor) {
  const severity = factor.severity;

  if (factor.kind === "smoke") {
    return {
      riskScore: 0.35 + severity * 0.45,
      routeCostMultiplier: 1.35 + severity,
      speedMultiplier: 0.9 - severity * 0.25,
      visibilityMultiplier: 0.65 - severity * 0.35,
    };
  }

  if (factor.kind === "fog") {
    return {
      riskScore: severity * 0.25,
      routeCostMultiplier: 1 + severity * 0.45,
      speedMultiplier: 1 - severity * 0.12,
      visibilityMultiplier: 1 - severity * 0.65,
    };
  }

  if (factor.kind === "rain" || factor.kind === "snow" || factor.kind === "storm") {
    return {
      riskScore: severity * 0.22,
      routeCostMultiplier: 1 + severity * 0.35,
      speedMultiplier: 1 - severity * 0.22,
      visibilityMultiplier: 1 - severity * 0.2,
    };
  }

  if (factor.kind === "exitClosed" || factor.kind === "escalatorOutage") {
    return {
      riskScore: 0.18 + severity * 0.25,
      routeCostMultiplier: 1.4 + severity * 1.2,
      speedMultiplier: 1 - severity * 0.12,
      visibilityMultiplier: 1,
    };
  }

  return {
    riskScore: factor.riskScore,
    routeCostMultiplier: factor.routeCostMultiplier,
    speedMultiplier: factor.speedMultiplier,
    visibilityMultiplier: factor.visibilityMultiplier,
  };
}

function storeAttractionMultiplierForFactor(factor: EnvironmentFactor) {
  if (factor.kind === "promotionSurge") {
    return 1 + factor.severity * 0.45;
  }

  return factor.kind === "smoke" || factor.kind === "exitClosed" ? 0.82 : 1;
}

function isFactorActive(factor: EnvironmentFactor, elapsedSeconds: number) {
  return (
    factor.startsAtSeconds <= elapsedSeconds &&
    (factor.endsAtSeconds === undefined || factor.endsAtSeconds >= elapsedSeconds)
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
