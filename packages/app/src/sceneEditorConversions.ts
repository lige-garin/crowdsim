import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

import type { EditorDocument, EditorShopBrand } from "./sceneEditorTypes";

export function createEditorDocumentFromScene(scene: CrowdSimScene): EditorDocument {
  return {
    buildings: scene.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      points: building.footprint.points.map((point) => ({ ...point })),
      entrancePosition: building.entrancePosition
        ? { ...building.entrancePosition }
        : undefined,
      heightMeters: building.heightMeters,
      floors: building.floors,
      residentCapacity: building.residentCapacity,
      workerCapacity: building.workerCapacity,
      visitorCapacity: building.visitorCapacity,
    })),
    countLines: scene.countLines.map((line) => ({
      id: line.id,
      points: [{ ...line.geometry.points[0] }, { ...line.geometry.points[1] }],
    })),
    entrances: scene.entrances.map((entrance) => ({
      id: entrance.id,
      kind: entrance.kind,
      position: { ...entrance.position },
      width: entrance.width,
      arrivalRatePerMinute: entrance.arrivalRatePerMinute,
    })),
    hazards: scene.hazards.map((hazard) => ({
      id: hazard.id,
      name: hazard.name,
      kind: hazard.kind,
      position: { ...hazard.position },
      radiusMeters: hazard.radiusMeters,
      affectedRoadId: hazard.affectedRoadId,
      affectedZoneId: hazard.affectedZoneId,
      startsAtSeconds: hazard.startsAtSeconds,
      endsAtSeconds: hazard.endsAtSeconds,
      severity: hazard.severity,
      speedMultiplier: hazard.speedMultiplier,
      visibilityMultiplier: hazard.visibilityMultiplier,
      routeCostMultiplier: hazard.routeCostMultiplier,
      riskScore: hazard.riskScore,
    })),
    nextId: 1,
    obstacles: scene.obstacles.map((obstacle) => ({
      id: obstacle.id,
      name: obstacle.name,
      kind: obstacle.kind,
      geometryType: obstacle.geometry.type,
      points: obstacle.geometry.points.map((point) => ({ ...point })),
      blocksMovement: obstacle.blocksMovement,
      routeCostMultiplier: obstacle.routeCostMultiplier,
    })),
    roads: scene.roads.map((road) => ({
      id: road.id,
      name: road.name,
      points: road.geometry.points.map((point) => ({ ...point })),
      widthMeters: road.widthMeters,
      direction: road.direction,
      speedLimitMetersPerSecond: road.speedLimitMetersPerSecond,
      capacityPerMinute: road.capacityPerMinute,
      walkable: road.walkable,
      transitOnly: road.transitOnly,
    })),
    servicePoints: scene.servicePoints.map((servicePoint) => ({
      id: servicePoint.id,
      kind: servicePoint.kind,
      position: { ...servicePoint.position },
      width: servicePoint.width,
      serviceMeanSeconds: servicePoint.serviceMeanSeconds,
      capacityPerMinute: servicePoint.capacityPerMinute,
    })),
    zones: scene.zones.map((zone) => ({
      id: zone.id,
      attraction: zone.attraction,
      category: zone.category,
      dwellMeanSeconds: zone.dwellMeanSeconds,
      name: zone.name,
      points: zone.geometry.points.map((point) => ({ ...point })),
      walkable: zone.walkable,
    })),
    shops: scene.shops.map((shop) => ({
      id: shop.id,
      brand: copyBrand(shop.brand),
      name: shop.name,
      position: { ...shop.position },
      size: { ...shop.size },
      attraction: shop.attraction,
      capacity: shop.capacity,
      dwellMeanSeconds: shop.dwellMeanSeconds,
    })),
    targets: scene.targets.map((target) => ({
      id: target.id,
      position: { ...target.position },
      radius: target.radius,
    })),
    transitStops: scene.transitStops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      roadId: stop.roadId,
      kind: stop.kind,
      position: { ...stop.position },
      capacity: stop.capacity,
      arrivalIntervalSeconds: stop.arrivalIntervalSeconds,
      alightingPerArrival: stop.alightingPerArrival,
      boardingCapacityPerMinute: stop.boardingCapacityPerMinute,
      delayFactor: stop.delayFactor,
      active: stop.active,
    })),
    walls: scene.walls.map((wall) => ({
      id: wall.id,
      points: wall.geometry.points.map((point) => ({ ...point })),
    })),
  };
}

export function createSceneFromEditorDocument(
  baseScene: CrowdSimScene,
  document: EditorDocument,
): CrowdSimScene {
  return parseScene({
    ...baseScene,
    roads: document.roads.map((road) => ({
      id: road.id,
      name: road.name,
      geometry: {
        type: "polyline",
        points: road.points.map((point) => ({ ...point })),
      },
      widthMeters: road.widthMeters,
      direction: road.direction,
      speedLimitMetersPerSecond: road.speedLimitMetersPerSecond,
      capacityPerMinute: road.capacityPerMinute,
      walkable: road.walkable,
      transitOnly: road.transitOnly,
    })),
    walls: document.walls.map((wall) => ({
      id: wall.id,
      geometry: {
        type: "polyline",
        points: wall.points.map((point) => ({ ...point })),
      },
      thickness: 0.2,
    })),
    entrances: document.entrances.map((entrance) => ({
      id: entrance.id,
      kind: entrance.kind,
      position: { ...entrance.position },
      width: entrance.width,
      arrivalRatePerMinute: entrance.arrivalRatePerMinute,
    })),
    targets: document.targets.map((target) => ({
      id: target.id,
      position: { ...target.position },
      radius: target.radius,
    })),
    zones: document.zones.map((zone) => ({
      id: zone.id,
      attraction: zone.attraction,
      category: zone.category,
      dwellMeanSeconds: zone.dwellMeanSeconds,
      geometry: {
        type: "polygon",
        points: zone.points.map((point) => ({ ...point })),
      },
      name: zone.name,
      walkable: zone.walkable,
    })),
    buildings: document.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      footprint: {
        type: "polygon",
        points: building.points.map((point) => ({ ...point })),
      },
      entrancePosition: building.entrancePosition
        ? { ...building.entrancePosition }
        : undefined,
      heightMeters: building.heightMeters,
      floors: building.floors,
      residentCapacity: building.residentCapacity,
      workerCapacity: building.workerCapacity,
      visitorCapacity: building.visitorCapacity,
    })),
    shops: document.shops.map((shop) => ({
      id: shop.id,
      brand: copyBrand(shop.brand),
      name: shop.name,
      position: { ...shop.position },
      size: { ...shop.size },
      attraction: shop.attraction,
      capacity: shop.capacity,
      dwellMeanSeconds: shop.dwellMeanSeconds,
    })),
    servicePoints: document.servicePoints.map((servicePoint) => ({
      id: servicePoint.id,
      kind: servicePoint.kind,
      position: { ...servicePoint.position },
      width: servicePoint.width,
      serviceMeanSeconds: servicePoint.serviceMeanSeconds,
      capacityPerMinute: servicePoint.capacityPerMinute,
    })),
    transitStops: document.transitStops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      roadId: stop.roadId,
      kind: stop.kind,
      position: { ...stop.position },
      capacity: stop.capacity,
      arrivalIntervalSeconds: stop.arrivalIntervalSeconds,
      alightingPerArrival: stop.alightingPerArrival,
      boardingCapacityPerMinute: stop.boardingCapacityPerMinute,
      delayFactor: stop.delayFactor,
      active: stop.active,
    })),
    obstacles: document.obstacles.map((obstacle) => ({
      id: obstacle.id,
      name: obstacle.name,
      kind: obstacle.kind,
      geometry: {
        type: obstacle.geometryType,
        points: obstacle.points.map((point) => ({ ...point })),
      },
      blocksMovement: obstacle.blocksMovement,
      routeCostMultiplier: obstacle.routeCostMultiplier,
    })),
    hazards: document.hazards.map((hazard) => ({
      id: hazard.id,
      name: hazard.name,
      kind: hazard.kind,
      position: { ...hazard.position },
      radiusMeters: hazard.radiusMeters,
      affectedRoadId: hazard.affectedRoadId,
      affectedZoneId: hazard.affectedZoneId,
      startsAtSeconds: hazard.startsAtSeconds,
      endsAtSeconds: hazard.endsAtSeconds,
      severity: hazard.severity,
      speedMultiplier: hazard.speedMultiplier,
      visibilityMultiplier: hazard.visibilityMultiplier,
      routeCostMultiplier: hazard.routeCostMultiplier,
      riskScore: hazard.riskScore,
    })),
    countLines: document.countLines.map((line) => ({
      id: line.id,
      geometry: {
        type: "polyline",
        points: line.points.map((point) => ({ ...point })),
      },
    })),
  });
}

function copyBrand(brand?: EditorShopBrand) {
  return brand
    ? {
        ...brand,
        personaAffinity: { ...brand.personaAffinity },
      }
    : undefined;
}
