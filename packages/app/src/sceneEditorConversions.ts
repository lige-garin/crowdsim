import { parseScene, sceneFloors, type CrowdSimScene } from "@crowdsim/scene-schema";
import { populationLibraryEntry, populationLibraryIdOf } from "./populationSampling";

import type { EditorDocument, EditorShopBrand } from "./sceneEditorTypes";

/**
 * First id number no existing `<kind>-<n>` id uses. Adders name new entities
 * `shop-${nextId}` etc.; starting at 1 on a scene that already holds `shop-1`
 * (any scene the editor once applied) produced a duplicate id, which the
 * schema rejects — so the second edit of a scene crashed on apply.
 */
function nextFreeIdNumber(scene: CrowdSimScene) {
  const groups = [
    scene.buildings,
    // Floors and connectors are named the same way and from the same counter,
    // so leaving them out handed their numbers straight back out: adding a
    // floor, applying, reopening and adding another produced a second
    // 'floor-1' and the apply was rejected as a duplicate id.
    scene.floors,
    scene.connectors,
    scene.countLines,
    scene.crosswalks,
    scene.entrances,
    scene.hazards,
    scene.obstacles,
    scene.roads,
    scene.servicePoints,
    scene.shops,
    scene.targets,
    scene.transitStops,
    scene.walls,
    scene.zones,
  ];
  let max = 0;
  for (const group of groups) {
    for (const { id } of group) {
      const match = /-(\d+)$/.exec(id);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

export function createEditorDocumentFromScene(scene: CrowdSimScene): EditorDocument {
  const floors = sceneFloors(scene);

  return {
    activeFloorId: floors[0]?.id,
    floors: floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      level: floor.level,
      elevationMeters: floor.elevationMeters,
    })),
    buildings: scene.buildings.map((building) => ({
      id: building.id,
      floorId: building.floorId,
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
    connectors: scene.connectors.map((connector) => ({
      id: connector.id,
      name: connector.name,
      kind: connector.kind,
      fromFloorId: connector.from.floorId,
      fromPoint: { ...connector.from.point },
      toFloorId: connector.to.floorId,
      toPoint: { ...connector.to.point },
      width: connector.width,
      bidirectional: connector.bidirectional,
      capacity: connector.capacity,
      carCount: connector.carCount,
      doorSeconds: connector.doorSeconds,
    })),
    countLines: scene.countLines.map((line) => ({
      id: line.id,
      floorId: line.floorId,
      name: line.name,
      points: [{ ...line.geometry.points[0] }, { ...line.geometry.points[1] }],
    })),
    crosswalks: scene.crosswalks.map((crosswalk) => ({
      id: crosswalk.id,
      floorId: crosswalk.floorId,
      name: crosswalk.name,
      roadId: crosswalk.roadId,
      position: { ...crosswalk.position },
      widthMeters: crosswalk.widthMeters,
    })),
    entrances: scene.entrances.map((entrance) => ({
      id: entrance.id,
      floorId: entrance.floorId,
      kind: entrance.kind,
      position: { ...entrance.position },
      width: entrance.width,
      arrivalRatePerMinute: entrance.arrivalRatePerMinute,
      arrivalProfile: entrance.arrivalProfile && {
        intervalMinutes: entrance.arrivalProfile.intervalMinutes,
        ratesPerMinute: [...entrance.arrivalProfile.ratesPerMinute],
      },
      groupShare: entrance.groupShare,
      exitIds: entrance.exitIds ? [...entrance.exitIds] : undefined,
      populationId: populationLibraryIdOf(entrance.population?.mix),
    })),
    hazards: scene.hazards.map((hazard) => ({
      id: hazard.id,
      floorId: hazard.floorId,
      name: hazard.name,
      kind: hazard.kind,
      position: { ...hazard.position },
      radiusMeters: hazard.radiusMeters,
      growthSeconds: hazard.growthSeconds,
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
    nextId: nextFreeIdNumber(scene),
    obstacles: scene.obstacles.map((obstacle) => ({
      id: obstacle.id,
      floorId: obstacle.floorId,
      name: obstacle.name,
      kind: obstacle.kind,
      geometryType: obstacle.geometry.type,
      points: obstacle.geometry.points.map((point) => ({ ...point })),
      blocksMovement: obstacle.blocksMovement,
      routeCostMultiplier: obstacle.routeCostMultiplier,
    })),
    roads: scene.roads.map((road) => ({
      id: road.id,
      floorId: road.floorId,
      name: road.name,
      points: road.geometry.points.map((point) => ({ ...point })),
      widthMeters: road.widthMeters,
      direction: road.direction,
      speedLimitMetersPerSecond: road.speedLimitMetersPerSecond,
      capacityPerMinute: road.capacityPerMinute,
      walkable: road.walkable,
      transitOnly: road.transitOnly,
      vehicleAccessible: road.vehicleAccessible,
      vehicleArrivalRatePerMinute: road.vehicleArrivalRatePerMinute,
      vehicleSpeedLimitMetersPerSecond: road.vehicleSpeedLimitMetersPerSecond,
    })),
    servicePoints: scene.servicePoints.map((servicePoint) => ({
      id: servicePoint.id,
      floorId: servicePoint.floorId,
      name: servicePoint.name,
      servers: servicePoint.servers,
      kind: servicePoint.kind,
      position: { ...servicePoint.position },
      width: servicePoint.width,
      serviceMeanSeconds: servicePoint.serviceMeanSeconds,
      capacityPerMinute: servicePoint.capacityPerMinute,
      nextServicePointId: servicePoint.nextServicePointId,
      outageWindows: servicePoint.outageWindows.map((window) => ({ ...window })),
    })),
    zones: scene.zones.map((zone) => ({
      id: zone.id,
      floorId: zone.floorId,
      attraction: zone.attraction,
      category: zone.category,
      dwellMeanSeconds: zone.dwellMeanSeconds,
      name: zone.name,
      points: zone.geometry.points.map((point) => ({ ...point })),
      walkable: zone.walkable,
    })),
    shops: scene.shops.map((shop) => ({
      id: shop.id,
      floorId: shop.floorId,
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
      floorId: target.floorId,
      position: { ...target.position },
      radius: target.radius,
    })),
    transitStops: scene.transitStops.map((stop) => ({
      id: stop.id,
      floorId: stop.floorId,
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
      floorId: wall.floorId,
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
    floors: document.floors.map((floor) => ({
      ...baseScene.floors.find((existing) => existing.id === floor.id),
      id: floor.id,
      name: floor.name,
      level: floor.level,
      elevationMeters: floor.elevationMeters,
    })),
    roads: document.roads.map((road) => ({
      id: road.id,
      floorId: road.floorId,
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
      vehicleAccessible: road.vehicleAccessible,
      vehicleArrivalRatePerMinute: road.vehicleArrivalRatePerMinute,
      vehicleSpeedLimitMetersPerSecond: road.vehicleSpeedLimitMetersPerSecond,
    })),
    walls: document.walls.map((wall) => ({
      id: wall.id,
      floorId: wall.floorId,
      geometry: {
        type: "polyline",
        points: wall.points.map((point) => ({ ...point })),
      },
      thickness: 0.2,
    })),
    entrances: document.entrances.map((entrance) => ({
      id: entrance.id,
      floorId: entrance.floorId,
      kind: entrance.kind,
      position: { ...entrance.position },
      width: entrance.width,
      arrivalRatePerMinute: entrance.arrivalRatePerMinute,
      arrivalProfile: entrance.arrivalProfile,
      groupShare: entrance.groupShare,
      exitIds: entrance.exitIds,
      population: entrance.populationId
        ? {
            mix:
              populationLibraryEntry(entrance.populationId)?.mix.map((entry) => ({
                ...entry,
              })) ?? [],
          }
        : undefined,
    })),
    targets: document.targets.map((target) => ({
      id: target.id,
      floorId: target.floorId,
      position: { ...target.position },
      radius: target.radius,
    })),
    zones: document.zones.map((zone) => ({
      id: zone.id,
      floorId: zone.floorId,
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
      floorId: building.floorId,
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
      floorId: shop.floorId,
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
      floorId: servicePoint.floorId,
      name: servicePoint.name,
      servers: servicePoint.servers,
      kind: servicePoint.kind,
      position: { ...servicePoint.position },
      width: servicePoint.width,
      serviceMeanSeconds: servicePoint.serviceMeanSeconds,
      capacityPerMinute: servicePoint.capacityPerMinute,
      nextServicePointId: servicePoint.nextServicePointId,
      outageWindows: servicePoint.outageWindows.map((window) => ({ ...window })),
    })),
    transitStops: document.transitStops.map((stop) => ({
      id: stop.id,
      floorId: stop.floorId,
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
      floorId: obstacle.floorId,
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
      floorId: hazard.floorId,
      name: hazard.name,
      kind: hazard.kind,
      position: { ...hazard.position },
      radiusMeters: hazard.radiusMeters,
      growthSeconds: hazard.growthSeconds,
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
    connectors: document.connectors.map((connector) => ({
      id: connector.id,
      name: connector.name,
      kind: connector.kind,
      from: { floorId: connector.fromFloorId, point: { ...connector.fromPoint } },
      to: { floorId: connector.toFloorId, point: { ...connector.toPoint } },
      width: connector.width,
      bidirectional: connector.bidirectional,
      capacity: connector.capacity,
      carCount: connector.carCount,
      doorSeconds: connector.doorSeconds,
    })),
    countLines: document.countLines.map((line) => ({
      id: line.id,
      floorId: line.floorId,
      name: line.name,
      geometry: {
        type: "polyline",
        points: line.points.map((point) => ({ ...point })),
      },
    })),
    crosswalks: document.crosswalks.map((crosswalk) => ({
      id: crosswalk.id,
      floorId: crosswalk.floorId,
      name: crosswalk.name,
      roadId: crosswalk.roadId,
      position: { ...crosswalk.position },
      widthMeters: crosswalk.widthMeters,
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
