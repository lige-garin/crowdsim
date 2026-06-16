import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { createBrandStoresFromScene, rankBrandStores } from "./brandAttraction";
import { createAgentMindset } from "./agentPersona";
import {
  compileBioCityRouteGraph,
  estimateBioCityRouteInfluence,
  nearestBioCityRouteNode,
} from "./bioCityRouteGraph";
import type { SimulationAgent, SimulationSink } from "./simulationEngine";
import type {
  SimulationAgentDecision,
  SimulationDecisionBackend,
} from "./simulationDecisionBackend";

type BioAgentProfile = CrowdSimScene["bioAgentProfiles"][number];

export type BioAgentBehaviorDecision = {
  agentId: number;
  explanation: string[];
  nextState: SimulationAgentDecision["nextState"];
  profileId?: string;
  selectedStoreId?: string;
  target: ScenePoint;
  targetSinkId?: string;
};

export type BioAgentBehaviorContext = {
  agent: SimulationAgent;
  elapsedSeconds: number;
  scene: CrowdSimScene;
  sinks: readonly SimulationSink[];
};

export function createBioCityDecisionBackend(
  scene: CrowdSimScene,
): SimulationDecisionBackend {
  return {
    decisionHz: 10,
    id: "rule-ts",
    decideAgents: ({ agents, elapsedSeconds, sinks }) =>
      agents.map((agent) =>
        toSimulationDecision(
          decideBioAgentBehavior({
            agent,
            elapsedSeconds,
            scene,
            sinks,
          }),
        ),
      ),
  };
}

export function shouldUseBioCityDecisionBackend(scene: CrowdSimScene) {
  return (
    scene.bioAgentProfiles.length > 0 ||
    scene.roads.length > 0 ||
    scene.transitStops.length > 0 ||
    scene.hazards.length > 0
  );
}

export function decideBioAgentBehavior({
  agent,
  elapsedSeconds,
  scene,
  sinks,
}: BioAgentBehaviorContext): BioAgentBehaviorDecision {
  const profile = pickBioAgentProfile(scene, agent.id);
  const influence = estimateBioCityRouteInfluence(scene, agent, elapsedSeconds);
  const perceivedRisk =
    influence.riskScore +
    activeHazardSeverityAtPoint(scene, agent, elapsedSeconds) *
      profile.weatherSensitivity;
  const evacuation = chooseEvacuationTarget(agent, sinks);

  if (
    evacuation &&
    (perceivedRisk >= profile.riskTolerance || influence.routeCostMultiplier >= 8)
  ) {
    return {
      agentId: agent.id,
      explanation: [
        `perceived risk ${perceivedRisk.toFixed(2)} exceeds tolerance ${profile.riskTolerance.toFixed(2)}`,
        `route cost x${influence.routeCostMultiplier.toFixed(2)}`,
      ],
      nextState: "evacuate",
      profileId: profile.id,
      target: evacuation.position,
      targetSinkId: evacuation.id,
    };
  }

  const transit = chooseTransitStop(scene, agent, profile, elapsedSeconds);

  if (transit) {
    return {
      agentId: agent.id,
      explanation: transit.explanation,
      nextState: transit.queue ? "queue" : "walk",
      profileId: profile.id,
      target: transit.target,
    };
  }

  const store = chooseStore(scene, agent, profile);

  if (store) {
    return {
      agentId: agent.id,
      explanation: store.explanation,
      nextState: store.queue ? "queue" : "enterStore",
      profileId: profile.id,
      selectedStoreId: store.storeId,
      target: store.target,
    };
  }

  const building = chooseShelterBuilding(scene, agent, profile, influence);

  if (building) {
    return {
      agentId: agent.id,
      explanation: building.explanation,
      nextState: "walk",
      profileId: profile.id,
      target: building.target,
    };
  }

  if (evacuation && profile.kind === "commuter") {
    return {
      agentId: agent.id,
      explanation: ["commuter without better BioCity target continues toward exit"],
      nextState: "leave",
      profileId: profile.id,
      target: evacuation.position,
      targetSinkId: evacuation.id,
    };
  }

  const graph = compileBioCityRouteGraph(scene, elapsedSeconds);
  const nearest = nearestBioCityRouteNode(graph, agent);

  return {
    agentId: agent.id,
    explanation: nearest
      ? [`nearest route node ${nearest.sourceId}`]
      : ["no BioCity target available"],
    nextState: "walk",
    profileId: profile.id,
    target: nearest?.position ?? { x: agent.targetX, y: agent.targetY },
  };
}

function activeHazardSeverityAtPoint(
  scene: CrowdSimScene,
  point: ScenePoint,
  elapsedSeconds: number,
) {
  return scene.hazards
    .filter(
      (hazard) =>
        hazard.startsAtSeconds <= elapsedSeconds &&
        (hazard.endsAtSeconds === undefined ||
          hazard.endsAtSeconds >= elapsedSeconds) &&
        distanceBetween(point, hazard.position) <= hazard.radiusMeters,
    )
    .reduce((severity, hazard) => Math.max(severity, hazard.severity), 0);
}

function chooseTransitStop(
  scene: CrowdSimScene,
  agent: SimulationAgent,
  profile: BioAgentProfile,
  elapsedSeconds: number,
) {
  if (profile.kind !== "commuter" && profile.kind !== "tourist") {
    return undefined;
  }

  const candidates = scene.transitStops
    .filter((stop) => stop.active)
    .map((stop) => {
      const influence = estimateBioCityRouteInfluence(
        scene,
        stop.position,
        elapsedSeconds,
      );
      const distance = distanceBetween(agent, stop.position);
      const queuePressure =
        stop.alightingPerArrival / Math.max(1, stop.capacity) + stop.delayFactor - 1;
      const score =
        profile.baseSpeedMetersPerSecond * 0.4 -
        Math.log1p(distance) * 0.12 -
        queuePressure * 0.4 -
        influence.riskScore * profile.riskTolerance;

      return {
        score,
        stop,
        influence,
        queuePressure,
      };
    })
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];

  if (!best || best.score < -0.7) {
    return undefined;
  }

  return {
    explanation: [
      `transit ${best.stop.kind}`,
      `delay x${best.stop.delayFactor.toFixed(2)}`,
      `risk ${best.influence.riskScore.toFixed(2)}`,
    ],
    queue: best.queuePressure > 0.45,
    target: best.stop.position,
  };
}

function chooseStore(
  scene: CrowdSimScene,
  agent: SimulationAgent,
  profile: BioAgentProfile,
) {
  if (profile.spendingIntent < 0.2) {
    return undefined;
  }

  const stores = createBrandStoresFromScene(scene);

  if (stores.length === 0) {
    return undefined;
  }

  const mindset = createAgentMindset({
    agentId: agent.id,
    seed: scene.seed,
  });
  const ranked = rankBrandStores(mindset, stores, {
    agentPosition: agent,
    crowdSensitivity: profile.riskTolerance,
  });
  const selected = ranked[0];
  const threshold = 0.18 + (1 - profile.spendingIntent) * 0.22;

  if (!selected || selected.probability < threshold) {
    return undefined;
  }

  return {
    explanation: [
      `spending intent ${profile.spendingIntent.toFixed(2)}`,
      ...selected.reasons.slice(0, 3),
    ],
    queue:
      selected.store.queueLength / Math.max(1, selected.store.brand.capacity) >
      profile.riskTolerance,
    storeId: selected.store.id,
    target: selected.store.position,
  };
}

function chooseShelterBuilding(
  scene: CrowdSimScene,
  agent: SimulationAgent,
  profile: BioAgentProfile,
  influence: { riskScore: number; routeCostMultiplier: number },
) {
  if (
    profile.shelterPreference < 0.55 ||
    (influence.riskScore < 0.2 && influence.routeCostMultiplier < 1.5)
  ) {
    return undefined;
  }

  const shelters = scene.buildings
    .filter((building) => building.entrancePosition)
    .sort(
      (left, right) =>
        distanceBetween(agent, left.entrancePosition!) -
        distanceBetween(agent, right.entrancePosition!),
    );
  const selected = shelters[0];

  if (!selected?.entrancePosition) {
    return undefined;
  }

  return {
    explanation: [
      `shelter preference ${profile.shelterPreference.toFixed(2)}`,
      `local risk ${influence.riskScore.toFixed(2)}`,
    ],
    target: selected.entrancePosition,
  };
}

function chooseEvacuationTarget(
  agent: SimulationAgent,
  sinks: readonly SimulationSink[],
) {
  return sinks
    .slice()
    .sort(
      (left, right) =>
        distanceBetween(agent, left.position) - distanceBetween(agent, right.position),
    )[0];
}

function pickBioAgentProfile(scene: CrowdSimScene, agentId: number): BioAgentProfile {
  if (scene.bioAgentProfiles.length > 0) {
    return scene.bioAgentProfiles[(agentId - 1) % scene.bioAgentProfiles.length];
  }

  return {
    id: "default-commuter",
    name: "Default Commuter",
    kind: "commuter",
    baseSpeedMetersPerSecond: 1.35,
    customParameters: {},
    fatigueRate: 0.2,
    groupAffinity: 0.4,
    riskTolerance: 0.5,
    shelterPreference: 0.5,
    spendingIntent: 0.3,
    weatherSensitivity: 0.5,
  };
}

function toSimulationDecision(
  decision: BioAgentBehaviorDecision,
): SimulationAgentDecision {
  return {
    agentId: decision.agentId,
    nextState: decision.nextState,
    selectedStoreId: decision.selectedStoreId,
    target: decision.target,
    targetSinkId: decision.targetSinkId,
  };
}

function distanceBetween(left: ScenePoint, right: ScenePoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
