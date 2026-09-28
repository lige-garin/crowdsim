import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { createAgentCohort } from "../engine/agentPersona";
import { createBrandStoresFromScene, rankBrandStores } from "../engine/brandAttraction";
import { calculateEnvironmentImpact } from "../engine/environmentEffects";
import { escapeHtml } from "../htmlEscape";
import { mean } from "../numberUtils";
import { createRouteCostMap } from "../engine/routeCostMap";

export type CommercialValidationBundle = {
  averageTopStoreProbability: number;
  brandProfileCount: number;
  environmentRiskScore: number;
  generatedStoreLotCount: number;
  notes: string[];
  routeCostMax: number;
  routeCostMin: number;
  shopCount: number;
  totalCapacity: number;
  zoneCount: number;
};

export function createCommercialValidationBundle(
  scene: CrowdSimScene,
): CommercialValidationBundle {
  const stores = createBrandStoresFromScene(scene);
  const agents = createAgentCohort({ count: 8, seed: scene.seed });
  const rankedProbabilities = agents.flatMap((agent) => {
    const ranked = rankBrandStores(agent, stores, {
      agentPosition: scene.entrances[0]?.position ?? { x: 0, y: 0 },
    });

    return ranked[0]?.probability ?? 0;
  });
  const routeCostMap = createRouteCostMap(scene);
  const environment = calculateEnvironmentImpact(scene);

  return {
    averageTopStoreProbability: round(mean(rankedProbabilities)),
    brandProfileCount: scene.brandProfiles.length,
    environmentRiskScore: round(environment.riskScore),
    generatedStoreLotCount: scene.storeLots.filter((lot) => lot.generated).length,
    notes: createCommercialNotes(scene, stores.length, environment.riskScore),
    routeCostMax: routeCostMap.maxCost,
    routeCostMin: routeCostMap.minCost,
    shopCount: scene.shops.length,
    totalCapacity: scene.shops.reduce((sum, shop) => sum + shop.capacity, 0),
    zoneCount: scene.zones.length,
  };
}

export function renderCommercialValidationHtml(bundle: CommercialValidationBundle) {
  return `<section>
  <h2>Commercial behavior validation</h2>
  <table>
    <tbody>
      <tr><th>Zones</th><td>${bundle.zoneCount}</td></tr>
      <tr><th>Generated store lots</th><td>${bundle.generatedStoreLotCount}</td></tr>
      <tr><th>Shops</th><td>${bundle.shopCount}</td></tr>
      <tr><th>Brand profiles</th><td>${bundle.brandProfileCount}</td></tr>
      <tr><th>Total capacity</th><td>${bundle.totalCapacity}</td></tr>
      <tr><th>Average top-store probability</th><td>${bundle.averageTopStoreProbability.toFixed(4)}</td></tr>
      <tr><th>Route cost range</th><td>${bundle.routeCostMin.toFixed(4)} - ${bundle.routeCostMax.toFixed(4)}</td></tr>
      <tr><th>Environment risk</th><td>${bundle.environmentRiskScore.toFixed(4)}</td></tr>
    </tbody>
  </table>
  <ul>${bundle.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
</section>`;
}

function createCommercialNotes(
  scene: CrowdSimScene,
  storeCount: number,
  riskScore: number,
) {
  const notes = [
    "Commercial validation summarizes generated stores, brand pull, route cost, and environmental risk.",
  ];

  if (scene.zones.length === 0) {
    notes.push("No commercial zones are defined.");
  }

  if (storeCount === 0) {
    notes.push("No brand-linked shops are available for agent store-choice scoring.");
  }

  if (riskScore > 0.4) {
    notes.push(
      "Environmental risk is high enough to alter shopping behavior and evacuation timing.",
    );
  }

  return notes;
}

function round(value: number) {
  return Number(value.toFixed(4));
}
