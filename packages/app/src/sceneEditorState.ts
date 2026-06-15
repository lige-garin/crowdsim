import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

export type EditorTool =
  | "select"
  | "zone"
  | "wall"
  | "source"
  | "sink"
  | "target"
  | "shop"
  | "counter"
  | "gate"
  | "countLine";

export type EditorWall = {
  id: string;
  points: ScenePoint[];
};

export type EditorEntrance = {
  id: string;
  kind: "source" | "sink";
  position: ScenePoint;
  width: number;
};

export type EditorTarget = {
  id: string;
  position: ScenePoint;
  radius: number;
};

type EditorShopBrand = NonNullable<CrowdSimScene["shops"][number]["brand"]>;
export type EditorZoneCategory = CrowdSimScene["zones"][number]["category"];

export type EditorZone = {
  id: string;
  attraction: number;
  category: EditorZoneCategory;
  dwellMeanSeconds: number;
  name?: string;
  points: ScenePoint[];
  walkable: boolean;
};

export type EditorShop = {
  id: string;
  brand?: EditorShopBrand;
  name?: string;
  position: ScenePoint;
  size: {
    width: number;
    height: number;
  };
  attraction: number;
  capacity: number;
  dwellMeanSeconds: number;
};

export type EditorServicePoint = {
  id: string;
  kind: "counter" | "gate";
  position: ScenePoint;
  width: number;
  serviceMeanSeconds: number;
  capacityPerMinute: number;
};

export type EditorCountLine = {
  id: string;
  points: [ScenePoint, ScenePoint];
};

export type EditorDocument = {
  countLines: EditorCountLine[];
  entrances: EditorEntrance[];
  nextId: number;
  servicePoints: EditorServicePoint[];
  shops: EditorShop[];
  targets: EditorTarget[];
  walls: EditorWall[];
  zones: EditorZone[];
};

export function createEditorDocumentFromScene(scene: CrowdSimScene): EditorDocument {
  return {
    countLines: scene.countLines.map((line) => ({
      id: line.id,
      points: [{ ...line.geometry.points[0] }, { ...line.geometry.points[1] }],
    })),
    entrances: scene.entrances.flatMap((entrance) =>
      entrance.kind === "bidirectional"
        ? []
        : [
            {
              id: entrance.id,
              kind: entrance.kind,
              position: { ...entrance.position },
              width: entrance.width,
            },
          ],
    ),
    nextId: 1,
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
    walls: scene.walls.map((wall) => ({
      id: wall.id,
      points: wall.geometry.points.map((point) => ({ ...point })),
    })),
  };
}

export function snapPoint(
  point: ScenePoint,
  gridSize: number,
  enabled: boolean,
): ScenePoint {
  if (!enabled) {
    return point;
  }

  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function addWall(
  document: EditorDocument,
  points: ScenePoint[],
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    walls: [
      ...document.walls,
      {
        id: `wall-${document.nextId}`,
        points: points.map((point) => ({ ...point })),
      },
    ],
  };
}

export function addEntrance(
  document: EditorDocument,
  kind: EditorEntrance["kind"],
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    entrances: [
      ...document.entrances,
      {
        id: `${kind}-${document.nextId}`,
        kind,
        position: { ...position },
        width: kind === "source" ? 4 : 5,
      },
    ],
    nextId: document.nextId + 1,
  };
}

export function addTarget(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    targets: [
      ...document.targets,
      {
        id: `target-${document.nextId}`,
        position: { ...position },
        radius: 1,
      },
    ],
  };
}

export function addZone(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    zones: [
      ...document.zones,
      {
        id: `zone-${document.nextId}`,
        attraction: 0.5,
        category: "mixed",
        dwellMeanSeconds: 180,
        points: rectangleAround(position, 18, 10),
        walkable: true,
      },
    ],
  };
}

export function addShop(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    shops: [
      ...document.shops,
      {
        id: `shop-${document.nextId}`,
        position: { ...position },
        size: {
          width: 8,
          height: 5,
        },
        attraction: 1,
        capacity: 12,
        dwellMeanSeconds: 240,
      },
    ],
  };
}

export function addServicePoint(
  document: EditorDocument,
  kind: EditorServicePoint["kind"],
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    nextId: document.nextId + 1,
    servicePoints: [
      ...document.servicePoints,
      {
        id: `${kind}-${document.nextId}`,
        kind,
        position: { ...position },
        width: kind === "gate" ? 4 : 3,
        serviceMeanSeconds: kind === "gate" ? 8 : 30,
        capacityPerMinute: kind === "gate" ? 120 : 30,
      },
    ],
  };
}

export function addCountLine(
  document: EditorDocument,
  position: ScenePoint,
): EditorDocument {
  return {
    ...document,
    countLines: [
      ...document.countLines,
      {
        id: `count-line-${document.nextId}`,
        points: [
          { ...position },
          {
            x: position.x + 8,
            y: position.y,
          },
        ],
      },
    ],
    nextId: document.nextId + 1,
  };
}

export function moveEntity(
  document: EditorDocument,
  id: string,
  delta: ScenePoint,
): EditorDocument {
  return {
    ...document,
    entrances: document.entrances.map((entrance) =>
      entrance.id === id
        ? {
            ...entrance,
            position: translatePoint(entrance.position, delta),
          }
        : entrance,
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

export function removeEntity(document: EditorDocument, id: string): EditorDocument {
  return {
    ...document,
    countLines: document.countLines.filter((line) => line.id !== id),
    entrances: document.entrances.filter((entrance) => entrance.id !== id),
    servicePoints: document.servicePoints.filter(
      (servicePoint) => servicePoint.id !== id,
    ),
    shops: document.shops.filter((shop) => shop.id !== id),
    targets: document.targets.filter((target) => target.id !== id),
    walls: document.walls.filter((wall) => wall.id !== id),
    zones: document.zones.filter((zone) => zone.id !== id),
  };
}

export function createSceneFromEditorDocument(
  baseScene: CrowdSimScene,
  document: EditorDocument,
): CrowdSimScene {
  return parseScene({
    ...baseScene,
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
      arrivalRatePerMinute: entrance.kind === "source" ? 120 : 0,
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

function translatePoint(point: ScenePoint, delta: ScenePoint): ScenePoint {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  };
}

function rectangleAround(
  center: ScenePoint,
  width: number,
  height: number,
): ScenePoint[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ];
}
