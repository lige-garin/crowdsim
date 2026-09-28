import type { ScenePoint } from "@crowdsim/scene-schema";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { TranslationKey } from "../i18n";
import type { EditorDocument } from "./sceneEditorState";

export function EditorLines({
  document,
  draftWallPoints,
  draftCountLine,
  onCountLineEndpointPointerDown,
  onEntityPointerDown,
  selectedId,
  t,
}: {
  document: EditorDocument;
  draftWallPoints: ScenePoint[];
  /** A count line being dragged out; drawn as a preview, not yet a line. */
  draftCountLine: { end: ScenePoint; start: ScenePoint } | null;
  onCountLineEndpointPointerDown: (
    event: ReactPointerEvent<SVGElement>,
    id: string,
    end: 0 | 1,
  ) => void;
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
            {line.name ?? t("countLineShort")}
          </text>
          {line.id === selectedId
            ? ([0, 1] as const).map((end) => (
                <circle
                  key={end}
                  className="editor-count-end"
                  cx={line.points[end].x}
                  cy={line.points[end].y}
                  data-testid={`count-line-end-${end}`}
                  r={1}
                  onPointerDown={(event) =>
                    onCountLineEndpointPointerDown(event, line.id, end)
                  }
                />
              ))
            : null}
        </g>
      ))}
      {draftCountLine ? (
        <polyline
          className="editor-count-line draft"
          points={pointsToSvg([draftCountLine.start, draftCountLine.end])}
        />
      ) : null}
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
      {document.connectors.map((connector) => {
        const onThisFloor =
          connector.fromFloorId === document.activeFloorId
            ? connector.fromPoint
            : connector.toPoint;
        const up = connector.toFloorId === document.activeFloorId;

        return (
          <g
            key={connector.id}
            className={
              connector.id === selectedId
                ? "editor-connector selected"
                : "editor-connector"
            }
            data-testid={`editor-connector-${connector.id}`}
            transform={`translate(${onThisFloor.x} ${onThisFloor.y})`}
            onPointerDown={(event) => onEntityPointerDown(event, connector.id)}
          >
            <rect
              x={-connector.width / 2}
              y={-2.4}
              width={connector.width}
              height={4.8}
            />
            {/* Which way it leads from here: down to the floor below, or up. */}
            <text y={0.5}>
              {connector.name ??
                `${connector.kind === "escalator" ? "ESC" : "ST"}${
                  connector.bidirectional ? "" : up ? " ↑" : " ↓"
                }`}
            </text>
          </g>
        );
      })}
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
