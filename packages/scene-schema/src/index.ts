import { z } from "zod";
import {
  areaSchema,
  basemapSchema,
  brandProfileSchema,
  connectorSchema,
  countLineSchema,
  customParametersSchema,
  environmentFactorSchema,
  entranceSchema,
  floorSchema,
  idSchema,
  pointSchema,
  populationSchema,
  servicePointSchema,
  shopSchema,
  storeLotSchema,
  targetSchema,
  visualAssetSchema,
  wallSchema,
  zoneSchema,
} from "./sceneSchemaBase";
import {
  bioAgentProfileSchema,
  buildingSchema,
  eventTimelineSchema,
  hazardSchema,
  obstacleSchema,
  roadSchema,
  sceneVisualSchema,
  transitStopSchema,
  weatherProfileSchema,
} from "./sceneSchemaBioCity";

export const sceneSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: idSchema,
    name: z.string().min(1),
    units: z.literal("meters").default("meters"),
    seed: z.number().int().nonnegative().default(1),
    // Pedestrian base speed, meters/second, before environment multipliers.
    // Defaults to Weidmann free-flow speed; the engine's own default must match
    // this so scenes that predate the field simulate at a plausible pace.
    speedMetersPerSecond: z.number().positive().default(1.34),
    /**
     * Who the crowd is (ADR-0011). Absent: the engine's own speed distribution,
     * which is what every scene written before this said.
     */
    population: populationSchema.optional(),
    world: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    visualAssets: z.array(visualAssetSchema).default([]),
    basemaps: z.array(basemapSchema).default([]),
    floors: z.array(floorSchema).default([]),
    walls: z.array(wallSchema).default([]),
    entrances: z.array(entranceSchema).default([]),
    areas: z.array(areaSchema).default([]),
    targets: z.array(targetSchema).default([]),
    zones: z.array(zoneSchema).default([]),
    storeLots: z.array(storeLotSchema).default([]),
    brandProfiles: z.array(brandProfileSchema).default([]),
    shops: z.array(shopSchema).default([]),
    servicePoints: z.array(servicePointSchema).default([]),
    countLines: z.array(countLineSchema).default([]),
    connectors: z.array(connectorSchema).default([]),
    environmentFactors: z.array(environmentFactorSchema).default([]),
    roads: z.array(roadSchema).default([]),
    buildings: z.array(buildingSchema).default([]),
    transitStops: z.array(transitStopSchema).default([]),
    obstacles: z.array(obstacleSchema).default([]),
    hazards: z.array(hazardSchema).default([]),
    weatherProfile: weatherProfileSchema,
    eventTimeline: eventTimelineSchema,
    bioAgentProfiles: z.array(bioAgentProfileSchema).default([]),
    customParameters: customParametersSchema,
    visual: sceneVisualSchema,
  })
  .superRefine((scene, context) => {
    const ids = new Set<string>();

    const addId = (id: string) => {
      if (ids.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate scene entity id '${id}'`,
          path: ["id"],
        });
      }

      ids.add(id);
    };

    for (const entity of [
      ...scene.basemaps,
      ...scene.floors,
      ...scene.walls,
      ...scene.entrances,
      ...scene.areas,
      ...scene.targets,
      ...scene.zones,
      ...scene.storeLots,
      ...scene.brandProfiles,
      ...scene.shops,
      ...scene.servicePoints,
      ...scene.countLines,
      ...scene.connectors,
      ...scene.environmentFactors,
      ...scene.visualAssets,
      ...scene.roads,
      ...scene.buildings,
      ...scene.transitStops,
      ...scene.obstacles,
      ...scene.hazards,
      ...scene.bioAgentProfiles,
      ...scene.eventTimeline.events,
    ]) {
      addId(entity.id);
    }

    if (scene.weatherProfile.id !== undefined) {
      addId(scene.weatherProfile.id);
    }

    for (const connector of scene.connectors) {
      for (const end of [connector.from, connector.to]) {
        if (!scene.floors.some((floor) => floor.id === end.floorId)) {
          context.addIssue({
            code: "custom",
            message: `Connector '${connector.id}' joins floor '${end.floorId}', which the scene does not declare`,
            path: ["connectors"],
          });
        }
      }

      if (connector.from.floorId === connector.to.floorId) {
        context.addIssue({
          code: "custom",
          message: `Connector '${connector.id}' starts and ends on the same floor`,
          path: ["connectors"],
        });
      }
    }

    // A floorId naming no floor would put the thing nowhere, and nothing
    // downstream could tell that from "on the only floor there is". Caught
    // here, once, rather than by each reader inventing a fallback.
    const floorIds = new Set(scene.floors.map((floor) => floor.id));

    for (const [key, entities] of Object.entries(scene)) {
      if (!Array.isArray(entities)) {
        continue;
      }

      for (const entity of entities) {
        const floorId: unknown = (entity as { floorId?: unknown }).floorId;

        if (typeof floorId === "string" && !floorIds.has(floorId)) {
          context.addIssue({
            code: "custom",
            message: `'${(entity as { id?: string }).id ?? "?"}' is on floor '${floorId}', which the scene does not declare`,
            path: [key],
          });
        }
      }
    }
  });

export type ScenePoint = z.infer<typeof pointSchema>;
export type CrowdSimScene = z.infer<typeof sceneSchema>;
export type CrowdSimSceneInput = z.input<typeof sceneSchema>;

export function parseScene(input: unknown): CrowdSimScene {
  return sceneSchema.parse(input);
}

export function safeParseScene(input: unknown) {
  return sceneSchema.safeParse(input);
}

export {
  baseFloorId,
  resolveFloorId,
  sceneFloors,
  sceneOnFloor,
  type SceneFloor,
} from "./sceneFloors";
