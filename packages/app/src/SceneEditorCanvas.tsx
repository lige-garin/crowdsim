import { crowdOverlaySelection } from "./crowdBudget";
import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { HeatmapCell } from "./heatmap";
import type { TranslationKey } from "./i18n";
import { AiImageOverlay } from "./AiImageOverlay";
import type { SceneImageOverlay } from "./sceneEditorImageOverlay";
import type { EditorBasemap } from "./sceneEditorBasemap";
import type { EditorViewMode } from "./sceneEditorViewMode";
import { EditorLines } from "./SceneEditorLines";
import type { EditorDocument } from "./sceneEditorState";
import { clamp } from "./sceneEditorUtils";
import { useLiveCrowd, type LiveCrowd } from "./liveCrowd";

type SceneEditorCanvasProps = {
  aiImageOverlay: SceneImageOverlay | null;
  baseScene: CrowdSimScene;
  basemap: EditorBasemap | null;
  document: EditorDocument;
  draftWallPoints: ScenePoint[];
  /** A count line being dragged out, or null when none is. */
  draftCountLine: { end: ScenePoint; start: ScenePoint } | null;
  gridSize: number;
  /** The live crowd drawn over the plan, if any (liveCrowd). */
  crowd?: LiveCrowd;
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onCountLineEndpointPointerDown: (
    event: ReactPointerEvent<SVGElement>,
    id: string,
    end: 0 | 1,
  ) => void;
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
  draftCountLine,
  gridSize,
  crowd,
  onCanvasPointerDown,
  onCountLineEndpointPointerDown,
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
        data-testid="editor-canvas"
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
          <EditorImageGeometryLayer overlay={aiImageOverlay} t={t} />
        ) : null}
        <EditorBioCityObjects
          document={document}
          onEntityPointerDown={onEntityPointerDown}
          selectedId={selectedId}
          t={t}
        />
        <EditorStoreLots scene={baseScene} />
        {viewMode === "isometric" ? <EditorShopExtrusions document={document} /> : null}
        <EditorLines
          document={document}
          draftWallPoints={draftWallPoints}
          draftCountLine={draftCountLine}
          onCountLineEndpointPointerDown={onCountLineEndpointPointerDown}
          onEntityPointerDown={onEntityPointerDown}
          selectedId={selectedId}
          t={t}
        />
        {crowd ? <EditorLiveAgents crowd={crowd} scene={baseScene} /> : null}
      </svg>
    </div>
  );
}

function EditorImageGeometryLayer({
  overlay,
  t,
}: {
  overlay: SceneImageOverlay;
  t: (key: TranslationKey) => string;
}) {
  if (overlay.status === "not-traced") {
    return (
      <g className="editor-image-geometry-empty" data-testid="image-geometry-empty">
        <text className="ai-image-overlay-title" x={1.6} y={3.2}>
          {t("imageNotTraced")}
        </text>
        <text className="ai-image-label" x={1.6} y={5.4}>
          {overlay.source.name}
        </text>
      </g>
    );
  }

  return (
    <g data-testid="image-geometry-traced">
      <text className="ai-image-label" x={1.6} y={5.4}>
        {t("imageTracingFixtureNotice")} {overlay.source.name}
      </text>
      <AiImageOverlay calibration={overlay.calibration} draft={overlay.draft} />
    </g>
  );
}

function EditorBioCityObjects({
  document,
  onEntityPointerDown,
  selectedId,
  t,
}: {
  document: EditorDocument;
  onEntityPointerDown: (event: ReactPointerEvent<SVGElement>, id: string) => void;
  selectedId: string | null;
  t: (key: TranslationKey) => string;
}) {
  return (
    <g className="editor-biocity-objects">
      {document.roads.map((road) => (
        <g key={road.id} onPointerDown={(event) => onEntityPointerDown(event, road.id)}>
          <polyline
            className="editor-road-hit"
            points={pointsToSvg(road.points)}
            strokeWidth={Math.max(road.widthMeters, 2)}
          />
          <polyline
            className={road.id === selectedId ? "editor-road selected" : "editor-road"}
            points={pointsToSvg(road.points)}
            strokeWidth={Math.max(road.widthMeters * 0.42, 0.7)}
          />
          <text
            className="editor-road-label"
            x={(road.points[0].x + road.points.at(-1)!.x) / 2}
            y={(road.points[0].y + road.points.at(-1)!.y) / 2 - 1.2}
          >
            {t("roadShort")}
          </text>
        </g>
      ))}
      {document.buildings.map((building) => (
        <g
          key={building.id}
          className={
            building.id === selectedId ? "editor-building selected" : "editor-building"
          }
          onPointerDown={(event) => onEntityPointerDown(event, building.id)}
        >
          <polygon points={pointsToSvg(building.points)} />
          <text
            x={
              building.points.reduce((sum, point) => sum + point.x, 0) /
              building.points.length
            }
            y={
              building.points.reduce((sum, point) => sum + point.y, 0) /
              building.points.length
            }
          >
            {t("buildingShort")}
          </text>
        </g>
      ))}
      {document.obstacles.map((obstacle) => (
        <g
          key={obstacle.id}
          className={
            obstacle.id === selectedId ? "editor-obstacle selected" : "editor-obstacle"
          }
          onPointerDown={(event) => onEntityPointerDown(event, obstacle.id)}
        >
          {obstacle.geometryType === "polygon" ? (
            <polygon points={pointsToSvg(obstacle.points)} />
          ) : (
            <>
              <polyline
                className="editor-road-hit"
                points={pointsToSvg(obstacle.points)}
              />
              <polyline points={pointsToSvg(obstacle.points)} />
            </>
          )}
          <text
            x={
              obstacle.points.reduce((sum, point) => sum + point.x, 0) /
              obstacle.points.length
            }
            y={
              obstacle.points.reduce((sum, point) => sum + point.y, 0) /
              obstacle.points.length
            }
          >
            {t("obstacleShort")}
          </text>
        </g>
      ))}
      {document.transitStops.map((stop) => (
        <g
          key={stop.id}
          className={
            stop.id === selectedId
              ? "editor-transit-stop selected"
              : "editor-transit-stop"
          }
          transform={`translate(${stop.position.x} ${stop.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, stop.id)}
        >
          <circle r={2.6} />
          <text y={0.45}>{t("transitStopShort")}</text>
        </g>
      ))}
      {document.crosswalks.map((crosswalk) => (
        <g
          key={crosswalk.id}
          className={
            crosswalk.id === selectedId
              ? "editor-crosswalk selected"
              : "editor-crosswalk"
          }
          transform={`translate(${crosswalk.position.x} ${crosswalk.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, crosswalk.id)}
        >
          <rect
            x={-crosswalk.widthMeters / 2}
            y={-1}
            width={crosswalk.widthMeters}
            height={2}
          />
          <text y={0.45}>{t("crosswalkShort")}</text>
        </g>
      ))}
      {document.hazards.map((hazard) => (
        <g
          key={hazard.id}
          className={
            hazard.id === selectedId ? "editor-hazard selected" : "editor-hazard"
          }
          transform={`translate(${hazard.position.x} ${hazard.position.y})`}
          onPointerDown={(event) => onEntityPointerDown(event, hazard.id)}
        >
          <circle r={hazard.radiusMeters} />
          <text y={0.45}>{t("hazardShort")}</text>
        </g>
      ))}
    </g>
  );
}

function EditorLiveAgents({
  crowd,
  scene,
}: {
  crowd: LiveCrowd;
  scene: CrowdSimScene;
}) {
  const agents = useLiveCrowd(crowd).snapshot?.agents ?? [];
  if (agents.length === 0) {
    return null;
  }

  const radius = Math.max(
    0.34,
    Math.min(0.72, Math.min(scene.world.width, scene.world.height) * 0.012),
  );
  // One SVG group per agent, so this samples instead of drawing the whole
  // crowd — ten thousand groups re-rendered every frame is not something the
  // DOM does. The cap is real, so it is stated on screen: a view that silently
  // draws a fraction of the number printed beside it is the bug this project
  // already fixed once in the 3D viewport.
  const selection = crowdOverlaySelection(agents.length);

  return (
    <g className="editor-live-agents" aria-label="live simulation agents">
      {selection.sampled ? (
        <text
          className="editor-live-agents-sample-note"
          data-testid="overlay-sample-note"
          x={1.5}
          y={2.6}
        >
          {`${selection.drawn} / ${selection.total}`}
        </text>
      ) : null}
      {agents.slice(0, selection.drawn).map((agent) => {
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
