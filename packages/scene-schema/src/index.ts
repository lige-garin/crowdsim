import { z } from "zod";
import {
  areaSchema,
  basemapSchema,
  brandProfileSchema,
  countLineSchema,
  customParametersSchema,
  environmentFactorSchema,
  entranceSchema,
  floorSchema,
  idSchema,
  pointSchema,
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
