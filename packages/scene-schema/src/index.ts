import { z } from "zod";

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "IDs may contain letters, numbers, '_' and '-'");

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const customParametersSchema = z.record(z.string(), z.unknown()).default({});

const polylineSchema = z.object({
  type: z.literal("polyline"),
  points: z.array(pointSchema).min(2),
});

const polygonSchema = z.object({
  type: z.literal("polygon"),
  points: z.array(pointSchema).min(3),
});

const wallSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  geometry: z.discriminatedUnion("type", [polylineSchema, polygonSchema]),
  thickness: z.number().positive().default(0.2),
});

const entranceSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["source", "sink", "bidirectional"]),
  position: pointSchema,
  width: z.number().positive(),
  arrivalRatePerMinute: z.number().nonnegative().default(0),
});

const areaSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["walkable", "blocked"]).default("walkable"),
  geometry: polygonSchema,
});

const targetSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  position: pointSchema,
  radius: z.number().positive().default(1),
});

const personaAffinitySchema = z
  .object({
    browser: z.number().min(0).max(1).optional(),
    commuter: z.number().min(0).max(1).optional(),
    family: z.number().min(0).max(1).optional(),
    goalBuyer: z.number().min(0).max(1).optional(),
    luxuryBuyer: z.number().min(0).max(1).optional(),
    serviceSeeker: z.number().min(0).max(1).optional(),
  })
  .default({});

const brandCategorySchema = z.enum([
  "anchor",
  "coffee",
  "cosmetics",
  "dining",
  "electronics",
  "entertainment",
  "family",
  "fastFashion",
  "grocery",
  "jewelry",
  "luxury",
  "restaurant",
  "service",
]);

const brandSchema = z.object({
  brandPower: z.number().min(0).max(1).default(0.5),
  category: brandCategorySchema,
  customParameters: customParametersSchema,
  loyaltyEffect: z.number().min(0).max(1).default(0.3),
  name: z.string().min(1).optional(),
  novelty: z.number().min(0).max(1).default(0.3),
  personaAffinity: personaAffinitySchema,
  priceTier: z.number().int().min(1).max(5).default(3),
  profileId: idSchema,
  promotion: z.number().min(0).max(1).default(0),
  visibility: z.number().min(0).max(1).default(0.5),
});

const visual2d5Schema = z
  .object({
    heightMeters: z.number().positive().default(3),
    signText: z.string().min(1).optional(),
    style: z.string().min(1).default("default"),
  })
  .default({ heightMeters: 3, style: "default" });

const basemapTransformSchema = z
  .object({
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    scale: z.number().positive().default(1),
    rotationDegrees: z.number().finite().default(0),
  })
  .default({ rotationDegrees: 0, scale: 1, x: 0, y: 0 });

const basemapCalibrationSchema = z
  .object({
    imagePointA: pointSchema,
    imagePointB: pointSchema,
    metersPerPixel: z.number().positive().optional(),
    realDistanceMeters: z.number().positive(),
  })
  .optional();

const basemapSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  kind: z.enum(["cad", "image", "pdf", "tiles"]).default("image"),
  sourceUri: z.string().min(1),
  opacity: z.number().min(0).max(1).default(0.65),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  transform: basemapTransformSchema,
  calibration: basemapCalibrationSchema,
  customParameters: customParametersSchema,
  widthMeters: z.number().positive().optional(),
  heightMeters: z.number().positive().optional(),
});

const visualAssetCalibrationSchema = z
  .object({
    accuracyMeters: z.number().nonnegative().optional(),
    origin: z
      .enum(["base-center", "scene-anchor", "source-origin"])
      .default("scene-anchor"),
    simulationProxy: z
      .object({
        entityId: idSchema,
        kind: z.enum(["area", "building", "obstacle", "road", "transitStop"]),
        role: z.enum(["alignment-only", "footprint-source"]).default("alignment-only"),
      })
      .optional(),
    unitScaleMeters: z.number().positive().default(1),
    upAxis: z.enum(["y-up", "z-up"]).default("y-up"),
    verified: z.boolean().default(false),
  })
  .default({
    origin: "scene-anchor",
    unitScaleMeters: 1,
    upAxis: "y-up",
    verified: false,
  });

const visualAssetSourceUrlSchema = z
  .string()
  .min(1)
  .refine(
    (sourceUrl) => sourceUrl.startsWith("/"),
    "visual asset URL must be a relative application route",
  )
  .refine(
    (sourceUrl) => /\.(gltf|glb|json)$/i.test(sourceUrl),
    "visual asset URL must reference glTF, GLB, or tileset JSON",
  )
  .refine(
    (sourceUrl) => !/sk-[a-z0-9_-]{12,}/i.test(sourceUrl),
    "visual asset URL must not expose secrets",
  );

const visualAssetSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["gltf-prop", "gltf-scene", "tileset"]),
  sourceUrl: visualAssetSourceUrlSchema,
  lodSources: z
    .object({
      high: visualAssetSourceUrlSchema.optional(),
      low: visualAssetSourceUrlSchema.optional(),
      medium: visualAssetSourceUrlSchema.optional(),
    })
    .default({}),
  originalSourceFormat: z
    .enum(["collada", "fbx", "glb", "gltf", "ifc", "obj", "revit", "sketchup"])
    .optional(),
  anchor: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite().default(0),
  }),
  rotationDegrees: z.number().finite().default(0),
  scale: z.number().positive().default(1),
  visible: z.boolean().default(true),
  collisionMode: z.literal("none").default("none"),
  calibration: visualAssetCalibrationSchema,
  lod: z.enum(["high", "low", "medium"]).default("medium"),
  attribution: z.string().min(1).optional(),
  customParameters: customParametersSchema,
});

const floorSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  level: z.number().int().default(0),
  elevationMeters: z.number().finite().default(0),
  world: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  basemapIds: z.array(idSchema).default([]),
  visible: z.boolean().default(true),
});

const zoneCategorySchema = z.enum([
  "anchor",
  "atrium",
  "corridor",
  "cosmetics",
  "dining",
  "electronics",
  "emergency",
  "entertainment",
  "fashion",
  "grocery",
  "jewelry",
  "mixed",
  "service",
]);

const zoneSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  category: zoneCategorySchema.default("mixed"),
  geometry: polygonSchema,
  walkable: z.boolean().default(true),
  attraction: z.number().min(0).max(1).default(0.5),
  dwellMeanSeconds: z.number().positive().default(180),
  personaAffinity: personaAffinitySchema,
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

const storeLotSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  zoneId: idSchema.optional(),
  shopId: idSchema.optional(),
  geometry: polygonSchema,
  frontage: z
    .object({
      type: z.literal("polyline"),
      points: z.array(pointSchema).length(2),
    })
    .optional(),
  entrancePosition: pointSchema.optional(),
  queueAnchor: pointSchema.optional(),
  generated: z.boolean().default(false),
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

const brandProfileSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  category: brandCategorySchema,
  brandPower: z.number().min(0).max(1).default(0.5),
  customParameters: customParametersSchema,
  loyaltyEffect: z.number().min(0).max(1).default(0.3),
  novelty: z.number().min(0).max(1).default(0.3),
  personaAffinity: personaAffinitySchema,
  priceTier: z.number().int().min(1).max(5).default(3),
  promotion: z.number().min(0).max(1).default(0),
  visibility: z.number().min(0).max(1).default(0.5),
});

const openingHoursSchema = z
  .object({
    opensAtMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    closesAtMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  })
  .refine(
    (hours) => hours.closesAtMinutes > hours.opensAtMinutes,
    "closing time must be after opening time",
  )
  .optional();

const shopSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  zoneId: idSchema.optional(),
  storeLotId: idSchema.optional(),
  position: pointSchema,
  entrancePosition: pointSchema.optional(),
  queueAnchor: pointSchema.optional(),
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  attraction: z.number().nonnegative().default(1),
  brand: brandSchema.optional(),
  capacity: z.number().int().positive().default(12),
  conversionRate: z.number().min(0).max(1).default(0.3),
  customParameters: customParametersSchema,
  dwellMeanSeconds: z.number().positive().default(240),
  openingHours: openingHoursSchema,
  serviceMeanSeconds: z.number().positive().optional(),
  visual: visual2d5Schema,
});

const servicePointSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["counter", "gate"]),
  position: pointSchema,
  width: z.number().positive().default(3),
  serviceMeanSeconds: z.number().positive().default(30),
  capacityPerMinute: z.number().nonnegative().default(60),
});

const countLineSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  geometry: z.object({
    type: z.literal("polyline"),
    points: z.array(pointSchema).length(2),
  }),
});

const environmentFactorSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).optional(),
    kind: z.enum([
      "announcement",
      "cold",
      "collapse",
      "constructionBarrier",
      "earthquake",
      "elevatorOutage",
      "escalatorOutage",
      "exitClosed",
      "fire",
      "flood",
      "fog",
      "gateFailure",
      "heat",
      "holidaySurge",
      "lightning",
      "lostCompanion",
      "powerOutage",
      "promotionSurge",
      "rain",
      "rumor",
      "smoke",
      "snow",
      "staffGuidance",
      "storm",
      "suddenCrowdWave",
      "trainDelay",
      "wind",
    ]),
    affectedAreaId: idSchema.optional(),
    targetId: idSchema.optional(),
    startsAtSeconds: z.number().nonnegative().default(0),
    endsAtSeconds: z.number().positive().optional(),
    severity: z.number().min(0).max(1).default(0.5),
    speedMultiplier: z.number().nonnegative().default(1),
    visibilityMultiplier: z.number().nonnegative().default(1),
    routeCostMultiplier: z.number().nonnegative().default(1),
    riskScore: z.number().min(0).max(1).default(0),
    behaviorTags: z.array(z.string().min(1)).default([]),
    customParameters: customParametersSchema,
  })
  .refine(
    (factor) =>
      factor.endsAtSeconds === undefined ||
      factor.endsAtSeconds > factor.startsAtSeconds,
    "environment factor end time must be after start time",
  );

const roadSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  geometry: polylineSchema,
  widthMeters: z.number().positive().default(6),
  direction: z.enum(["oneWayBackward", "oneWayForward", "twoWay"]).default("twoWay"),
  speedLimitMetersPerSecond: z.number().positive().default(1.4),
  capacityPerMinute: z.number().nonnegative().default(180),
  walkable: z.boolean().default(true),
  transitOnly: z.boolean().default(false),
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

const buildingKindSchema = z.enum([
  "civic",
  "mixedUse",
  "office",
  "residential",
  "retail",
  "shelter",
  "transit",
  "utility",
]);

const buildingSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  zoneId: idSchema.optional(),
  kind: buildingKindSchema.default("mixedUse"),
  footprint: polygonSchema,
  entrancePosition: pointSchema.optional(),
  heightMeters: z.number().positive().default(18),
  floors: z.number().int().positive().default(5),
  residentCapacity: z.number().int().nonnegative().default(0),
  workerCapacity: z.number().int().nonnegative().default(0),
  visitorCapacity: z.number().int().nonnegative().default(0),
  openingHours: openingHoursSchema,
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

const transitStopSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  roadId: idSchema.optional(),
  kind: z.enum(["bus", "metro", "rideHail", "shuttle", "taxi", "tram"]),
  position: pointSchema,
  capacity: z.number().int().positive().default(80),
  arrivalIntervalSeconds: z.number().positive().default(300),
  alightingPerArrival: z.number().int().nonnegative().default(24),
  boardingCapacityPerMinute: z.number().nonnegative().default(60),
  delayFactor: z.number().positive().default(1),
  active: z.boolean().default(true),
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

const obstacleSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: idSchema.optional(),
  kind: z.enum([
    "constructionBarrier",
    "debris",
    "fence",
    "landscape",
    "securityLine",
    "water",
  ]),
  geometry: z.discriminatedUnion("type", [polylineSchema, polygonSchema]),
  blocksMovement: z.boolean().default(true),
  routeCostMultiplier: z.number().nonnegative().default(4),
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

const hazardSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).optional(),
    kind: z.enum([
      "crowdSurge",
      "fire",
      "flood",
      "powerOutage",
      "roadClosure",
      "securityIncident",
      "smoke",
      "transitDisruption",
    ]),
    position: pointSchema,
    radiusMeters: z.number().positive().default(8),
    affectedRoadId: idSchema.optional(),
    affectedZoneId: idSchema.optional(),
    startsAtSeconds: z.number().nonnegative().default(0),
    endsAtSeconds: z.number().positive().optional(),
    severity: z.number().min(0).max(1).default(0.5),
    speedMultiplier: z.number().nonnegative().default(1),
    visibilityMultiplier: z.number().nonnegative().default(1),
    routeCostMultiplier: z.number().nonnegative().default(1),
    riskScore: z.number().min(0).max(1).default(0.3),
    customParameters: customParametersSchema,
    visual: visual2d5Schema,
  })
  .refine(
    (hazard) =>
      hazard.endsAtSeconds === undefined ||
      hazard.endsAtSeconds > hazard.startsAtSeconds,
    "hazard end time must be after start time",
  );

const weatherSampleSchema = z.object({
  startsAtSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().default(3600),
  condition: z
    .enum([
      "clear",
      "cloudy",
      "cold",
      "fog",
      "heat",
      "heavyRain",
      "rain",
      "snow",
      "storm",
      "wind",
    ])
    .default("clear"),
  temperatureC: z.number().finite(),
  apparentTemperatureC: z.number().finite().optional(),
  precipitationMmPerHour: z.number().nonnegative().default(0),
  windSpeedMetersPerSecond: z.number().nonnegative().default(0),
  windDirectionDegrees: z.number().min(0).max(360).default(0),
  humidityPercent: z.number().min(0).max(100).default(50),
  visibilityMeters: z.number().positive().optional(),
  customParameters: customParametersSchema,
});

const weatherProfileSchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().min(1).optional(),
    source: z
      .enum(["historical-mcp", "manual", "noaa", "open-meteo", "qweather", "synthetic"])
      .default("manual"),
    year: z.number().int().min(1900).max(2200).optional(),
    location: z
      .object({
        name: z.string().min(1).optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timezone: z.string().min(1).default("Asia/Shanghai"),
      })
      .optional(),
    samples: z.array(weatherSampleSchema).default([]),
    customParameters: customParametersSchema,
  })
  .default({ customParameters: {}, source: "manual", samples: [] });

const cityEventSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).optional(),
    kind: z.enum([
      "buildingOpen",
      "buildingClose",
      "hazardEnd",
      "hazardStart",
      "roadClose",
      "roadOpen",
      "shopClose",
      "shopOpen",
      "transitDelay",
      "weatherChange",
    ]),
    startsAtSeconds: z.number().nonnegative(),
    endsAtSeconds: z.number().positive().optional(),
    targetId: idSchema.optional(),
    payload: customParametersSchema,
  })
  .refine(
    (event) =>
      event.endsAtSeconds === undefined || event.endsAtSeconds > event.startsAtSeconds,
    "city event end time must be after start time",
  );

const eventTimelineSchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().min(1).optional(),
    startsAtIso: z.string().datetime().optional(),
    timeScale: z.number().positive().default(1),
    events: z.array(cityEventSchema).default([]),
    customParameters: customParametersSchema,
  })
  .default({ customParameters: {}, events: [], timeScale: 1 });

const bioAgentProfileSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.enum([
    "commuter",
    "emergencyResponder",
    "resident",
    "shopper",
    "student",
    "tourist",
    "worker",
  ]),
  baseSpeedMetersPerSecond: z.number().positive().default(1.35),
  spendingIntent: z.number().min(0).max(1).default(0.3),
  weatherSensitivity: z.number().min(0).max(1).default(0.5),
  riskTolerance: z.number().min(0).max(1).default(0.5),
  fatigueRate: z.number().min(0).max(1).default(0.2),
  groupAffinity: z.number().min(0).max(1).default(0.4),
  shelterPreference: z.number().min(0).max(1).default(0.5),
  customParameters: customParametersSchema,
});

const sceneVisualSchema = z
  .object({
    defaultView: z.enum(["topDown", "isometric"]).default("topDown"),
    storeHeightMeters: z.number().positive().default(3),
    wallHeightMeters: z.number().positive().default(2.8),
  })
  .default({
    defaultView: "topDown",
    storeHeightMeters: 3,
    wallHeightMeters: 2.8,
  });

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
