import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { describeViewportUnsupported } from "./viewportRenderMode";
import { deconflictLabels } from "./simulationViewportLabels";
import {
  selectViewportAgentAnnotations,
  selectViewportOverlayAgents,
  type ViewportAgentAnnotation,
  type ViewportAgentOverlayFrame,
} from "./simulationViewportOverlay";
import type { SimulationSnapshot } from "./simulationEngine";
import type { ViewMode } from "./simulationViewportTypes";
import { primitiveBounds } from "./simulationViewportGeometry";

export function ViewportUnsupportedNotice({
  detail,
  language,
}: {
  detail?: string;
  language: "zh" | "en";
}) {
  const copy = describeViewportUnsupported(language);

  return (
    <div
      className="render-unsupported"
      data-testid="viewport-unsupported"
      role="status"
      aria-live="polite"
    >
      <div className="render-unsupported-card">
        <p className="render-unsupported-eyebrow">WebGPU</p>
        <h3>{copy.title}</h3>
        <p>{copy.reason}</p>
        <p className="render-unsupported-muted">{copy.stillWorks}</p>
        <p className="render-unsupported-muted">{copy.requirement}</p>
        {detail && (
          <details>
            <summary>{copy.detailsLabel}</summary>
            <code>{detail}</code>
          </details>
        )}
      </div>
    </div>
  );
}

export function ViewportLiveAgentOverlay({
  scene,
  sharedAgentOverlay,
  snapshot,
  viewMode,
}: {
  scene?: CrowdSimScene;
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
  snapshot?: SimulationSnapshot;
  viewMode: ViewMode;
}) {
  const overlayAgents = scene
    ? selectViewportAgentAnnotations({
        scene,
        sharedAgentOverlay,
        snapshot,
        viewMode,
      })
    : selectViewportOverlayAgents(snapshot, sharedAgentOverlay).map((agent) => ({
        depth: 0,
        icon: "i",
        id: agent.id,
        intent: "seekService" as const,
        label: "Seeking service",
        leftPercent: 0,
        topPercent: 0,
      }));
  const agents =
    scene && overlayAgents.length === 0
      ? createAmbientAgentAnnotations(scene, viewMode)
      : overlayAgents;

  if (!scene || agents.length === 0) {
    return null;
  }

  return (
    <div
      className={`render-agent-overlay ${
        viewMode === "3d" ? "render-agent-overlay-3d" : "render-agent-overlay-2d"
      }`}
      aria-hidden="true"
    >
      {agents.map((agent) => (
        <span
          key={agent.id}
          className="render-agent-marker"
          style={{
            left: `${agent.leftPercent}%`,
            top: `${agent.topPercent}%`,
            zIndex: Math.round(agent.depth * 1000),
          }}
        >
          <span className="render-agent-dot" />
          <span className="render-agent-intent" title={agent.label}>
            {agent.icon}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ViewportCityLabelOverlay({
  scene,
  viewMode,
}: {
  scene?: CrowdSimScene;
  viewMode: ViewMode;
}) {
  if (!scene) {
    return null;
  }

  const labels = deconflictLabels(createCityLabels(scene, viewMode));

  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="render-city-label-overlay" aria-hidden="true">
      {labels.map((label) => (
        <span
          key={label.id}
          className={`render-city-label render-city-label-${label.kind}`}
          style={{
            left: `${label.leftPercent}%`,
            top: `${label.topPercent}%`,
            zIndex: label.zIndex,
          }}
        >
          <strong>{label.title}</strong>
          <span>{label.value}</span>
        </span>
      ))}
    </div>
  );
}

function createAmbientAgentAnnotations(
  scene: CrowdSimScene,
  viewMode: ViewMode,
): ViewportAgentAnnotation[] {
  const seeds = scene.roads.flatMap((road) => road.geometry.points);
  const fallbackSeeds = [
    { x: scene.world.width * 0.25, y: scene.world.height * 0.55 },
    { x: scene.world.width * 0.45, y: scene.world.height * 0.5 },
    { x: scene.world.width * 0.65, y: scene.world.height * 0.58 },
  ];
  const points = seeds.length > 0 ? seeds : fallbackSeeds;
  const intents = [
    { icon: "$", intent: "browseFashion" as const, label: "Shopping" },
    { icon: "C", intent: "buyCoffee" as const, label: "Coffee" },
    { icon: "F", intent: "eatMeal" as const, label: "Dining" },
    { icon: "Q", intent: "queue" as const, label: "Queueing" },
    { icon: "M", intent: "meetCompanion" as const, label: "Meeting" },
    { icon: ">", intent: "goToExit" as const, label: "Going to exit" },
  ];

  return Array.from({ length: viewMode === "3d" ? 42 : 64 }, (_, index) => {
    const point = points[index % points.length];
    const laneOffset = ((index % 7) - 3) * 1.8;
    const waveOffset = Math.sin(index * 1.7 + scene.seed) * 3.4;
    const position = projectScenePointToOverlay(
      {
        x: clampNumber(
          point.x + waveOffset + (index % 3) * 5.2,
          2,
          scene.world.width - 2,
        ),
        y: clampNumber(point.y + laneOffset, 2, scene.world.height - 2),
      },
      scene,
      viewMode,
    );
    const intent = intents[index % intents.length];

    return {
      depth: position.depth,
      icon: intent.icon,
      id: -index - 1,
      intent: intent.intent,
      label: intent.label,
      leftPercent: position.leftPercent,
      topPercent: position.topPercent,
    };
  }).sort((left, right) => left.depth - right.depth);
}

function createCityLabels(scene: CrowdSimScene, viewMode: ViewMode) {
  const buildingLabels = scene.buildings.slice(0, 4).map((building) => {
    const bounds = primitiveBounds(building.footprint.points);
    const position = projectScenePointToOverlay(bounds.center, scene, viewMode);

    return {
      id: building.id,
      kind: "building",
      leftPercent: position.leftPercent,
      title: building.name ?? building.id,
      topPercent: position.topPercent - 4,
      value: `${building.visitorCapacity ?? building.workerCapacity ?? 0} people`,
      zIndex: 200 + Math.round(position.depth * 100),
    };
  });
  const shopLabels = scene.shops.slice(0, 4).map((shop) => {
    const position = projectScenePointToOverlay(shop.position, scene, viewMode);

    return {
      id: shop.id,
      kind: "shop",
      leftPercent: position.leftPercent,
      title: shop.name,
      topPercent: position.topPercent - 3,
      value: `${Math.round(shop.attraction * 100)}% attraction`,
      zIndex: 240 + Math.round(position.depth * 100),
    };
  });
  const transitLabels = scene.transitStops.slice(0, 3).map((stop) => {
    const position = projectScenePointToOverlay(stop.position, scene, viewMode);

    return {
      id: stop.id,
      kind: "transit",
      leftPercent: position.leftPercent,
      title: stop.name ?? stop.id,
      topPercent: position.topPercent - 2,
      value: `${stop.capacity} capacity`,
      zIndex: 260 + Math.round(position.depth * 100),
    };
  });
  const hazardLabels = scene.hazards.slice(0, 2).map((hazard) => {
    const position = projectScenePointToOverlay(hazard.position, scene, viewMode);

    return {
      id: hazard.id,
      kind: "hazard",
      leftPercent: position.leftPercent,
      title: hazard.name ?? hazard.id,
      topPercent: position.topPercent,
      value: `Risk ${Math.round(hazard.riskScore * 100)}%`,
      zIndex: 280 + Math.round(position.depth * 100),
    };
  });

  return [...buildingLabels, ...shopLabels, ...transitLabels, ...hazardLabels];
}

function projectScenePointToOverlay(
  point: ScenePoint,
  scene: CrowdSimScene,
  viewMode: ViewMode,
) {
  if (viewMode === "2d") {
    return {
      depth: clampNumber(point.y / scene.world.height, 0, 1),
      leftPercent: clampNumber((point.x / scene.world.width) * 100, 4, 96),
      topPercent: clampNumber((point.y / scene.world.height) * 100, 4, 96),
    };
  }

  const normalizedX = point.x / scene.world.width - 0.5;
  const normalizedY = point.y / scene.world.height - 0.5;

  return {
    depth: clampNumber(
      (point.y + point.x * 0.18) / (scene.world.height + scene.world.width * 0.18),
      0,
      1,
    ),
    leftPercent: clampNumber(50 + normalizedX * 58 + normalizedY * 18, 5, 95),
    topPercent: clampNumber(54 + normalizedY * 32 - normalizedX * 10, 7, 92),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}
