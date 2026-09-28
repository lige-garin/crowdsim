import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

export type ImagePoint = {
  x: number;
  y: number;
};

export type ImageScaleCalibration = {
  metersPerPixel: number;
  originPixel: ImagePoint;
  originScene: ScenePoint;
};

export type ImageLineSegment = {
  confidence: number;
  id: string;
  kind: "wall" | "count-line";
  points: [ImagePoint, ImagePoint];
};

export type ImageEntranceDraft = {
  confidence: number;
  id: string;
  kind: "sink" | "source";
  position: ImagePoint;
  widthPixels: number;
};

export type ImageGeometryDraft = {
  entrances?: readonly ImageEntranceDraft[];
  lines: readonly ImageLineSegment[];
};

export function calibrateImageScale(options: {
  knownDistanceMeters: number;
  pixelA: ImagePoint;
  pixelB: ImagePoint;
  sceneOrigin?: ScenePoint;
}): ImageScaleCalibration {
  const pixelDistance = Math.hypot(
    options.pixelB.x - options.pixelA.x,
    options.pixelB.y - options.pixelA.y,
  );

  if (pixelDistance <= 0 || options.knownDistanceMeters <= 0) {
    throw new Error("Scale calibration requires a positive pixel and meter distance");
  }

  return {
    metersPerPixel: options.knownDistanceMeters / pixelDistance,
    originPixel: options.pixelA,
    originScene: options.sceneOrigin ?? { x: 0, y: 0 },
  };
}

export function imagePointToScenePoint(
  point: ImagePoint,
  calibration: ImageScaleCalibration,
): ScenePoint {
  return {
    x: round(
      calibration.originScene.x +
        (point.x - calibration.originPixel.x) * calibration.metersPerPixel,
    ),
    y: round(
      calibration.originScene.y +
        (point.y - calibration.originPixel.y) * calibration.metersPerPixel,
    ),
  };
}

export function createSceneFromImageGeometry(
  baseScene: CrowdSimScene,
  draft: ImageGeometryDraft,
  calibration: ImageScaleCalibration,
) {
  const walls = draft.lines
    .filter((line) => line.kind === "wall")
    .map((line) => ({
      geometry: {
        points: line.points.map((point) => imagePointToScenePoint(point, calibration)),
        type: "polyline" as const,
      },
      id: line.id,
    }));
  const countLines = draft.lines
    .filter((line) => line.kind === "count-line")
    .map((line) => ({
      geometry: {
        points: line.points.map((point) => imagePointToScenePoint(point, calibration)),
        type: "polyline" as const,
      },
      id: line.id,
    }));
  const entrances = (draft.entrances ?? []).map((entrance) => ({
    arrivalRatePerMinute: entrance.kind === "source" ? 60 : 0,
    id: entrance.id,
    kind: entrance.kind,
    position: imagePointToScenePoint(entrance.position, calibration),
    width: round(entrance.widthPixels * calibration.metersPerPixel),
  }));

  return parseScene({
    ...baseScene,
    countLines: [...baseScene.countLines, ...countLines],
    entrances: [...baseScene.entrances, ...entrances],
    id: `${baseScene.id}-image-draft`,
    name: `${baseScene.name} Image Draft`,
    walls: [...baseScene.walls, ...walls],
  });
}

export function findLowConfidenceGeometry(draft: ImageGeometryDraft, threshold = 0.7) {
  return [
    ...draft.lines
      .filter((line) => line.confidence < threshold)
      .map((line) => ({ confidence: line.confidence, id: line.id, kind: line.kind })),
    ...(draft.entrances ?? [])
      .filter((entrance) => entrance.confidence < threshold)
      .map((entrance) => ({
        confidence: entrance.confidence,
        id: entrance.id,
        kind: entrance.kind,
      })),
  ];
}

export function mergeNearbyLineSegments(
  lines: readonly ImageLineSegment[],
  snapPixels: number,
) {
  return lines.map((line, index) => {
    const previous = lines[index - 1];

    if (!previous || previous.kind !== line.kind) {
      return line;
    }

    const previousEnd = previous.points[1];
    const currentStart = line.points[0];
    const distance = Math.hypot(
      previousEnd.x - currentStart.x,
      previousEnd.y - currentStart.y,
    );

    if (distance > snapPixels) {
      return line;
    }

    return {
      ...line,
      points: [previousEnd, line.points[1]] as [ImagePoint, ImagePoint],
    };
  });
}

function round(value: number) {
  return Number(value.toFixed(3));
}
