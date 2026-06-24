import type { ScenePoint } from "@crowdsim/scene-schema";

// Retail-first plan §2 P2: multi-floor vertical transport. Escalators / elevators
// / stairs / atrium connectors carry a floor-change cost into routing. A cross-
// floor trip pays: horizontal distance to a connector + costPerLevel * |levels|
// + horizontal distance from the connector to the destination. Out-of-service
// connectors (environment factors elevatorOutage / escalatorOutage) and
// connectors that do not span both levels are excluded. Pure + deterministic.

export type VerticalConnectorType = "escalator" | "elevator" | "stairs";

export type VerticalConnector = {
  id: string;
  position: ScenePoint;
  minLevel: number;
  maxLevel: number;
  type: VerticalConnectorType;
  /** Effective-distance cost added per level traversed. */
  costPerLevel: number;
  outOfService?: boolean;
};

export type VerticalRouteEndpoint = {
  position: ScenePoint;
  level: number;
};

export type VerticalRouteResult = {
  /** Total effective distance; Infinity when no connector links the levels. */
  cost: number;
  connectorId: string | null;
  levelChange: number;
};

function distance(a: ScenePoint, b: ScenePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function computeVerticalRouteCost(
  origin: VerticalRouteEndpoint,
  destination: VerticalRouteEndpoint,
  connectors: readonly VerticalConnector[],
): VerticalRouteResult {
  const levelChange = destination.level - origin.level;

  if (levelChange === 0) {
    return {
      cost: distance(origin.position, destination.position),
      connectorId: null,
      levelChange: 0,
    };
  }

  const lowLevel = Math.min(origin.level, destination.level);
  const highLevel = Math.max(origin.level, destination.level);
  const levels = Math.abs(levelChange);

  let bestCost = Number.POSITIVE_INFINITY;
  let bestConnectorId: string | null = null;

  for (const connector of connectors) {
    if (connector.outOfService) {
      continue;
    }
    if (connector.minLevel > lowLevel || connector.maxLevel < highLevel) {
      continue;
    }
    const cost =
      distance(origin.position, connector.position) +
      connector.costPerLevel * levels +
      distance(connector.position, destination.position);
    if (cost < bestCost) {
      bestCost = cost;
      bestConnectorId = connector.id;
    }
  }

  return { cost: bestCost, connectorId: bestConnectorId, levelChange };
}
