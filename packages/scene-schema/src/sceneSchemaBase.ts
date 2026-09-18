import { z } from "zod";

export const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "IDs may contain letters, numbers, '_' and '-'");

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const customParametersSchema = z.record(z.string(), z.unknown()).default({});

export const polylineSchema = z.object({
  type: z.literal("polyline"),
  points: z.array(pointSchema).min(2),
});

export const polygonSchema = z.object({
  type: z.literal("polygon"),
  points: z.array(pointSchema).min(3),
});

export const wallSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  geometry: z.discriminatedUnion("type", [polylineSchema, polygonSchema]),
  thickness: z.number().positive().default(0.2),
});

export const entranceSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["source", "sink", "bidirectional"]),
  position: pointSchema,
  width: z.number().positive(),
  arrivalRatePerMinute: z.number().nonnegative().default(0),
  /**
   * Arrivals by time slot from the start of the run, people a minute in each
   * slot (a demand profile, as entry schedules in pedestrian tools). Replaces
   * `arrivalRatePerMinute` while it lasts; nobody arrives after the last slot.
   */
  arrivalProfile: z
    .object({
      intervalMinutes: z.number().positive().default(15),
      ratesPerMinute: z.array(z.number().nonnegative()).min(1),
    })
    .optional(),
  /**
   * Share of arriving people who come in groups of two to four. Absent: 0.7,
   * observed on a busy commercial walkway (Moussaïd et al. 2010).
   */
  groupShare: z.number().min(0).max(1).optional(),
  /**
   * Exits that people arriving here may leave by (ADR-0008). Absent or empty:
   * any exit. Evacuation ignores it.
   */
  exitIds: z.array(idSchema).optional(),
});

export const areaSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["walkable", "blocked"]).default("walkable"),
  geometry: polygonSchema,
});

export const targetSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  position: pointSchema,
  radius: z.number().positive().default(1),
});

export const personaAffinitySchema = z
  .object({
    browser: z.number().min(0).max(1).optional(),
    commuter: z.number().min(0).max(1).optional(),
    family: z.number().min(0).max(1).optional(),
    goalBuyer: z.number().min(0).max(1).optional(),
    luxuryBuyer: z.number().min(0).max(1).optional(),
    serviceSeeker: z.number().min(0).max(1).optional(),
  })
  .default({});

export const brandCategorySchema = z.enum([
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

export const brandSchema = z.object({
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

export const visual2d5Schema = z
  .object({
    heightMeters: z.number().positive().default(3),
    signText: z.string().min(1).optional(),
    style: z.string().min(1).default("default"),
  })
  .default({ heightMeters: 3, style: "default" });

export const basemapTransformSchema = z
  .object({
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    scale: z.number().positive().default(1),
    rotationDegrees: z.number().finite().default(0),
  })
  .default({ rotationDegrees: 0, scale: 1, x: 0, y: 0 });

export const basemapCalibrationSchema = z
  .object({
    imagePointA: pointSchema,
    imagePointB: pointSchema,
    metersPerPixel: z.number().positive().optional(),
    realDistanceMeters: z.number().positive(),
  })
  .optional();

export const basemapSchema = z.object({
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

export const visualAssetCalibrationSchema = z
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

export const visualAssetSourceUrlSchema = z
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

export const visualAssetSchema = z.object({
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

export const floorSchema = z.object({
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

export const zoneCategorySchema = z.enum([
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

export const zoneSchema = z.object({
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

export const storeLotSchema = z.object({
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

export const brandProfileSchema = z.object({
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

export const openingHoursSchema = z
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

export const shopSchema = z.object({
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

export const servicePointSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["counter", "gate"]),
  position: pointSchema,
  width: z.number().positive().default(3),
  serviceMeanSeconds: z.number().positive().default(30),
  capacityPerMinute: z.number().nonnegative().default(60),
  /**
   * People served at once (ADR-0008). Absent: derived from the declared
   * capacity, max(1, round(capacityPerMinute × serviceMeanSeconds / 60)).
   */
  servers: z.number().int().positive().optional(),
});

export const countLineSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  geometry: z.object({
    type: z.literal("polyline"),
    points: z.array(pointSchema).length(2),
  }),
});

export const environmentFactorSchema = z
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
