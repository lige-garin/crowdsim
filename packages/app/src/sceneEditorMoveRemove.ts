import type { ScenePoint } from "@crowdsim/scene-schema";

import { translatePoint } from "./sceneEditorGeometry";
import type { EditorDocument } from "./sceneEditorTypes";

export function moveEntity(
  document: EditorDocument,
  id: string,
  delta: ScenePoint,
): EditorDocument {
  return {
    ...document,
    buildings: document.buildings.map((building) =>
      building.id === id
        ? {
            ...building,
            points: building.points.map((point) => translatePoint(point, delta)),
            entrancePosition: building.entrancePosition
              ? translatePoint(building.entrancePosition, delta)
              : undefined,
          }
        : building,
    ),
    entrances: document.entrances.map((entrance) =>
      entrance.id === id
        ? {
            ...entrance,
            position: translatePoint(entrance.position, delta),
          }
        : entrance,
    ),
    hazards: document.hazards.map((hazard) =>
      hazard.id === id
        ? {
            ...hazard,
            position: translatePoint(hazard.position, delta),
          }
        : hazard,
    ),
    obstacles: document.obstacles.map((obstacle) =>
      obstacle.id === id
        ? {
            ...obstacle,
            points: obstacle.points.map((point) => translatePoint(point, delta)),
          }
        : obstacle,
    ),
    roads: document.roads.map((road) =>
      road.id === id
        ? {
            ...road,
            points: road.points.map((point) => translatePoint(point, delta)),
          }
        : road,
    ),
    countLines: document.countLines.map((line) =>
      line.id === id
        ? {
            ...line,
            points: line.points.map((point) => translatePoint(point, delta)) as [
              ScenePoint,
              ScenePoint,
            ],
          }
        : line,
    ),
    servicePoints: document.servicePoints.map((servicePoint) =>
      servicePoint.id === id
        ? {
            ...servicePoint,
            position: translatePoint(servicePoint.position, delta),
          }
        : servicePoint,
    ),
    shops: document.shops.map((shop) =>
      shop.id === id
        ? {
            ...shop,
            position: translatePoint(shop.position, delta),
          }
        : shop,
    ),
    targets: document.targets.map((target) =>
      target.id === id
        ? {
            ...target,
            position: translatePoint(target.position, delta),
          }
        : target,
    ),
    transitStops: document.transitStops.map((stop) =>
      stop.id === id
        ? {
            ...stop,
            position: translatePoint(stop.position, delta),
          }
        : stop,
    ),
    zones: document.zones.map((zone) =>
      zone.id === id
        ? {
            ...zone,
            points: zone.points.map((point) => translatePoint(point, delta)),
          }
        : zone,
    ),
    walls: document.walls.map((wall) =>
      wall.id === id
        ? {
            ...wall,
            points: wall.points.map((point) => translatePoint(point, delta)),
          }
        : wall,
    ),
  };
}

/**
 * Move one end of a count line. The whole line can already be dragged by its
 * body, but a line is only useful across the flow you want to count, and that
 * is a matter of where its two ends sit — which is why the ends get their own
 * handles rather than only a translate.
 */
export function moveCountLineEndpoint(
  document: EditorDocument,
  id: string,
  endpoint: 0 | 1,
  point: ScenePoint,
): EditorDocument {
  return {
    ...document,
    countLines: document.countLines.map((line) =>
      line.id === id
        ? {
            ...line,
            points: endpoint === 0 ? [point, line.points[1]] : [line.points[0], point],
          }
        : line,
    ),
  };
}

export function removeEntity(document: EditorDocument, id: string): EditorDocument {
  return {
    ...document,
    buildings: document.buildings.filter((building) => building.id !== id),
    countLines: document.countLines.filter((line) => line.id !== id),
    entrances: document.entrances.filter((entrance) => entrance.id !== id),
    hazards: document.hazards.filter((hazard) => hazard.id !== id),
    obstacles: document.obstacles.filter((obstacle) => obstacle.id !== id),
    roads: document.roads.filter((road) => road.id !== id),
    servicePoints: document.servicePoints.filter(
      (servicePoint) => servicePoint.id !== id,
    ),
    shops: document.shops.filter((shop) => shop.id !== id),
    targets: document.targets.filter((target) => target.id !== id),
    transitStops: document.transitStops.filter((stop) => stop.id !== id),
    walls: document.walls.filter((wall) => wall.id !== id),
    zones: document.zones.filter((zone) => zone.id !== id),
  };
}
