import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { HeatmapCell } from "./heatmap";
import type { TranslationKey } from "./i18n";
import { AiImageOverlay } from "./AiImageOverlay";
import type { ImageGeometryDraft, ImageScaleCalibration } from "./aiImageGeometry";
import type { EditorBasemap } from "./sceneEditorBasemap";
import type { EditorViewMode } from "./sceneEditorViewMode";
import type { EditorDocument } from "./sceneEditorState";
import { clamp } from "./sceneEditorUtils";
import type { SimulationAgent } from "./simulationEngine";

type SceneEditorCanvasProps = {
  aiImageOverlay: {
    calibration: ImageScaleCalibration;
    draft: ImageGeometryDraft;
  } | null;
  baseScene: CrowdSimScene;
  basemap: EditorBasemap | null;
  document: EditorDocument;
  draftWallPoints: ScenePoint[];
  gridSize: number;
  liveAgents: readonly SimulationAgent[];
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onEntityPointerDown: (event: ReactPointerEvent<SVGElement>, id: string) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  selectedId: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
  t: (key: TranslationKey) => string;
  visibleHeatmapCells: readonly HeatmapCell[];
  viewMode: EditorViewMode;
};

export function SceneEditorCanvas({
  aiImageOverlay,
  baseScene,
  basemap,
  document,
  draftWallPoints,
  gridSize,
  liveAgents,
  onCanvasPointerDown,
  onEntityPointerDown,
  onPointerMove,
  onPointerUp,
  selectedId,
  svgRef,
  t,
  visibleHeatmapCells,
  viewMode,
}: SceneEditorCanvasProps) {
  return (
    <div className="editor-canvas-wrap">
      <svg
        ref={svgRef}
        className="editor-canvas"
        role="img"
        aria-label={t("editableSceneCanvas")}
        viewBox={`0 0 ${baseScene.world.width} ${baseScene.world.height}`}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <rect
          width={baseScene.world.width}
          height={baseScene.world.height}
          className="editor-floor"
        />
        {basemap ? <EditorBasemapLayer basemap={basemap} scene={baseScene} /> : null}
        <EditorGrid scene={baseScene} gridSize={gridSize} />
        <EditorHeatmap cells={visibleHeatmapCells} t={t} />
        {aiImageOverlay ? (
          <AiImageOverlay
            calibration={aiImageOverlay.calibration}
            draft={aiImageOverlay.draft}
          />
        ) : null}
        <EditorStoreLots scene={baseScene} />
        {viewMode === "isometric" ? <EditorShopExtrusions document={document} /> : null}
        <EditorLines
          document={document}
          draftWallPoints={draftWallPoints}
          onEntityPointerDown={onEntityPointerDown}
          selectedId={selectedId}
          t={t}
        />
        <EditorLiveAgents agents={liveAgents} scene={baseScene} />
      </svg>
    </div>
  );
}

function EditorLiveAgents({
  agents,
  scene,
}: {
  agents: readonly SimulationAgent[];
  scene: CrowdSimScene;
}) {
  if (agents.length === 0) {
    return null;
  }

  const radius = Math.max(
    0.34,
    Math.min(0.72, Math.min(scene.world.width, scene.world.height) * 0.012),
  );

  return (
    <g className="editor-live-agents" aria-label="live simulation agents">
      {agents.slice(0, 500).map((agent) => {
        const x = clamp(agent.x, 0, scene.world.width);
        const y = clamp(agent.y, 0, scene.world.height);
        const speed = Math.hypot(agent.vx, agent.vy);
        const direction =
          speed > 0.001
            ? {
                x: (agent.vx / speed) * radius * 2.1,
                y: (agent.vy / speed) * radius * 2.1,
              }
            : null;

        return (
          <g
            key={agent.id}
            className="editor-live-agent"
            data-agent-id={agent.id}
            transform={`translate(${x} ${y})`}
          >
            <circle
              className="editor-live-agent-shadow"
              cx={0.14}
              cy={0.18}
              r={radius}
            />
            <circle className="editor-live-agent-body" r={radius} />
            {direction ? (
              <line
                className="editor-live-agent-heading"
                x1={0}
                y1={0}
                x2={direction.x}
                y2={direction.y}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function EditorStoreLots({ scene }: { scene: CrowdSimScene }) {
  if (scene.storeLots.length === 0) {
    return null;
  }

  return (
    <g className="editor-store-lots">
      {scene.storeLots.map((lot) => (
        <polygon key={lot.id} points={pointsToSvg(lot.geometry.points)} />
      ))}
    </g>
  );
}

function EditorBasemapLayer({
  basemap,
  scene,
}: {
  basemap: EditorBasemap;
  scene: CrowdSimScene;
}) {
  const width = basemap.widthMeters ?? scene.world.width;
  const height = basemap.heightMeters ?? scene.world.height;
  const { rotationDegrees, scale, x, y } = basemap.transform;

  return (
    <g
      className={basemap.locked ? "editor-basemap locked" : "editor-basemap"}
      opacity={basemap.opacity}
      transform={`translate(${x} ${y}) rotate(${rotationDegrees}) scale(${scale})`}
    >
      <image
        href={basemap.sourceUri}
        x={0}
        y={0}
        width={width}
        height={height}
        preserveAspectRatio="none"
      />
    </g>
  );
}

function EditorGrid({ gridSize, scene }: { gridSize: number; scene: CrowdSimScene }) {
  return (
    <g className="editor-grid">
      {range(0, scene.world.width, gridSize).map((x) => (
        <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={scene.world.height} />
      ))}
      {range(0, scene.world.height, gridSize).map((y) => (
        <line key={`y-${y}`} x1={0} y1={y} x2={scene.world.width} y2={y} />
      ))}
    </g>
  );
}

function EditorHeatmap({
  cells,
  t,
}: {
  cells: readonly HeatmapCell[];
  t: (key: TranslationKey) => string;
}) {
  if (cells.length === 0) {
    return null;
  }

  return (
    <g className="editor-heatmap" aria-label={t("densityHeatmap")}>
      {cells.map((cell) => (
        <rect
          key={cell.id}
          x={cell.x}
          y={cell.y}
          width={cell.width}
          height={cell.height}
          style={{ opacity: 0.12 + cell.intensity * 0.5 }}
        />
      ))}
    </g>
  );
}

function EditorLines({
  document,
  draftWallPoints,
  onEntityPointerDown,
  selectedId,
  t,
}: {
  document: EditorDocument;
  draftWallPoints: ScenePoint[];
  onEntityPointerDown: (event: ReactPointerEvent<SVGElement>, id: string) => void;
  selectedId: string | null;
  t: (key: TranslationKey) => string;
}) {
  return (
    <>
      {document.zones.map((zone) => (
        <g
          key={zone.id}
          className={
            zone.id === selectedId
              ? `editor-zone editor-zone-${zone.category} selected`
              : `editor-zone editor-zone-${zone.category}`
          }
          onPointerDown={(event) => onEntityPointerDown(event, zone.id)}
        >
          <polygon points={pointsToSvg(zone.points)} />
          <text
            x={
              zone.points.reduce((sum, point) => sum + point.x, 0) / zone.points.length
            }
            y={
              zone.points.reduce((sum, point) => sum + point.y, 0) / zone.points.length
            }
          >
            {zone.category}
          </text>
        </g>
      ))}
      {document.walls.map((wall) => (
        <g key={wall.id} onPointerDown={(event) => onEntityPointerDown(event, wall.id)}>
          <polyline className="editor-wall-hit" points={pointsToSvg(wall.points)} />
          <polyline
            className={wall.id === selectedId ? "editor-wall selected" : "editor-wall"}
            points={pointsToSvg(wall.points)}
          />
        </g>
      ))}
      {draftWallPoints.length > 0 ? (
        <polyline className="editor-wall-draft" points={pointsToSvg(draftWallPoints)} />
      ) : null}
      {document.countLines.map((line) => (
        <g key={line.id} onPointerDown={(event) => onEntityPointerDown(event, line.id)}>
          <polyline className="editor-wall-hit" points={pointsToSvg(line.points)} />
          <polyline
            className={
              line.id === selectedId
                ? "editor-count-line selected"
                : "editor-count-line"
            }
            points={pointsToSvg(line.points)}
          />
          <text
            className="editor-count-label"
            x={(line.points[0].x + line.points[1].x) / 2}
            y={(line.points[0].y + line.points[1].y) / 2 - 0.7}
          >
            {t("countLineShort")}
          </text>
        </g>
      ))}
      {document.shops.map((shop) => (
        <g
          key={shop.id}
          className={shopClassName(shop, selectedId)}
          transform={`translate(${shop.position.x} ${shop.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, shop.id)}
        >
          <rect
            x={-shop.size.width / 2}
            y={-shop.size.height / 2}
            width={shop.size.width}
            height={shop.size.height}
          />
          <text y={0.4}>{t("shopShort")}</text>
        </g>
      ))}
      {document.servicePoints.map((servicePoint) => (
        <g
          key={servicePoint.id}
          className={
            servicePoint.id === selectedId
              ? "editor-service selected"
              : "editor-service"
          }
          transform={`translate(${servicePoint.position.x} ${servicePoint.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, servicePoint.id)}
        >
          <rect
            x={-servicePoint.width / 2}
            y={-1.4}
            width={servicePoint.width}
            height={2.8}
            className={
              servicePoint.kind === "gate"
                ? "editor-service-gate"
                : "editor-service-counter"
            }
          />
          <text y={0.35}>
            {servicePoint.kind === "gate" ? t("gateShort") : t("counterShort")}
          </text>
        </g>
      ))}
      {document.entrances.map((entrance) => (
        <g
          key={entrance.id}
          className={
            entrance.id === selectedId ? "editor-node selected" : "editor-node"
          }
          transform={`translate(${entrance.position.x} ${entrance.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, entrance.id)}
        >
          <rect
            x={-entrance.width / 2}
            y={-1.2}
            width={entrance.width}
            height={2.4}
            className={entrance.kind === "source" ? "editor-source" : "editor-sink"}
          />
          <text y={0.35}>
            {entrance.kind === "source" ? t("sourceShort") : t("sinkShort")}
          </text>
        </g>
      ))}
      {document.targets.map((target) => (
        <g
          key={target.id}
          className={target.id === selectedId ? "editor-node selected" : "editor-node"}
          transform={`translate(${target.position.x} ${target.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, target.id)}
        >
          <circle r={target.radius + 0.7} className="editor-target" />
          <text y={0.35}>{t("targetShort")}</text>
        </g>
      ))}
    </>
  );
}

function EditorShopExtrusions({ document }: { document: EditorDocument }) {
  return (
    <g className="editor-shop-extrusions">
      {document.shops.map((shop) => {
        const left = shop.position.x - shop.size.width / 2;
        const right = shop.position.x + shop.size.width / 2;
        const top = shop.position.y - shop.size.height / 2;
        const bottom = shop.position.y + shop.size.height / 2;
        const lift = Math.min(3.5, Math.max(1.2, shop.size.height * 0.22));

        return (
          <g
            key={`${shop.id}-2d5`}
            className={`editor-shop-volume editor-shop-category-${shop.brand?.category ?? "service"}`}
          >
            <polygon
              points={`${left},${top} ${right},${top} ${right},${bottom} ${left},${bottom}`}
            />
            <polygon
              className="editor-shop-side"
              points={`${right},${top} ${right + lift},${top - lift} ${right + lift},${bottom - lift} ${right},${bottom}`}
            />
            <polygon
              className="editor-shop-front"
              points={`${left},${top} ${right},${top} ${right + lift},${top - lift} ${left + lift},${top - lift}`}
            />
            <text x={shop.position.x + lift / 2} y={top - lift * 0.45}>
              {shop.name ?? shop.brand?.name ?? shop.id}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function shopClassName(
  shop: EditorDocument["shops"][number],
  selectedId: string | null,
) {
  const names = [
    "editor-shop",
    `editor-shop-category-${shop.brand?.category ?? "service"}`,
  ];

  if (shop.id === selectedId) {
    names.push("selected");
  }

  return names.join(" ");
}

function pointsToSvg(points: ScenePoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function range(start: number, end: number, step: number) {
  const values: number[] = [];

  for (let value = start; value <= end; value += step) {
    values.push(value);
  }

  return values;
}
