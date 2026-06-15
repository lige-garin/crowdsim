import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

export type FloorSpec = {
  elevationMeters: number;
  id: string;
  name: string;
  scene: CrowdSimScene;
};

export type VerticalConnector = {
  fromFloorId: string;
  id: string;
  kind: "elevator" | "escalator" | "stairs";
  position: {
    x: number;
    y: number;
  };
  toFloorId: string;
};

export type MultiFloorScene = {
  connectors: VerticalConnector[];
  floors: FloorSpec[];
  id: string;
  name: string;
};

export function createMultiFloorScene(options: {
  connectors?: readonly VerticalConnector[];
  floors: readonly FloorSpec[];
  id: string;
  name: string;
}): MultiFloorScene {
  return {
    connectors: [...(options.connectors ?? [])],
    floors: options.floors.map((floor) => ({
      ...floor,
      scene: parseScene(floor.scene),
    })),
    id: options.id,
    name: options.name,
  };
}

export function flattenMultiFloorScene(
  multiFloor: MultiFloorScene,
  floorId: string,
): CrowdSimScene | null {
  const floor = multiFloor.floors.find((candidate) => candidate.id === floorId);

  if (!floor) {
    return null;
  }

  return parseScene({
    ...floor.scene,
    id: `${multiFloor.id}-${floor.id}`,
    name: `${multiFloor.name} / ${floor.name}`,
  });
}

export function summarizeMultiFloorScene(multiFloor: MultiFloorScene) {
  return {
    connectorCount: multiFloor.connectors.length,
    floorCount: multiFloor.floors.length,
    totalEntrances: multiFloor.floors.reduce(
      (sum, floor) => sum + floor.scene.entrances.length,
      0,
    ),
    totalWorldAreaSquareMeters: Number(
      multiFloor.floors
        .reduce(
          (sum, floor) => sum + floor.scene.world.width * floor.scene.world.height,
          0,
        )
        .toFixed(2),
    ),
  };
}
