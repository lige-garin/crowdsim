import { z } from "zod";

export const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "IDs may contain letters, numbers, '_' and '-'");

/**
 * The floor a primitive sits on, naming an entry in the scene's `floors`. A
 * scene with no floors is one unnamed floor and every primitive is on it, which
 * is every scene written before floors existed — so this stays optional, and an
 * absent value never means "nowhere".
 */
export const floorIdSchema = idSchema.optional();

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const customParametersSchema = z.record(z.string(), z.unknown()).default({});

/**
 * Who the crowd is made of: a share of people drawn from each named walking
 * profile (ADR-0011).
 *
 * The profile ids are resolved by the app, not here, because the speeds behind
 * them come from a published population table and belong with the code that
 * cites it. An absent or empty population means the scene does not say, and
 * everyone walks at the engine's own default.
 */
export const populationMixEntrySchema = z.object({
  /** A walking profile the app knows, e.g. an IMO population group. */
  profileId: z.string().min(1),
  /** Share of arrivals drawn from it, 0..1. */
  share: z.number().min(0).max(1),
});

export const populationSchema = z
  .object({
    name: z.string().min(1).optional(),
    mix: z.array(populationMixEntrySchema).min(1),
  })
  .superRefine((population, context) => {
    const total = population.mix.reduce((sum, entry) => sum + entry.share, 0);

    // A mix that does not add up is a scene that has not said what happens to
    // the rest of the crowd, and every reader would have to invent an answer.
    if (Math.abs(total - 1) > 1e-6) {
      context.addIssue({
        code: "custom",
        message: `Population shares add up to ${total}, not 1`,
        path: ["mix"],
      });
    }

    const seen = new Set<string>();

    for (const entry of population.mix) {
      if (seen.has(entry.profileId)) {
        context.addIssue({
          code: "custom",
          message: `Population names '${entry.profileId}' twice`,
          path: ["mix"],
        });
      }

      seen.add(entry.profileId);
    }
  });

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
  floorId: floorIdSchema,
  geometry: z.discriminatedUnion("type", [polylineSchema, polygonSchema]),
  thickness: z.number().positive().default(0.2),
});

export const entranceSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
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
  /** Who comes through this door (ADR-0011). Absent: the scene's population. */
  population: populationSchema.optional(),
});

export const areaSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
  kind: z.enum(["walkable", "blocked"]).default("walkable"),
  geometry: polygonSchema,
});

export const targetSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
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
  floorId: floorIdSchema,
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
    (sourceUrl) =>
      sourceUrl.startsWith("/") ||
      sourceUrl.startsWith("data:model/gltf-binary;base64,"),
    "visual asset URL must be a relative application route or embedded GLB",
  )
  .refine(
    (sourceUrl) =>
      /\.(gltf|glb|json)$/i.test(sourceUrl) ||
      sourceUrl.startsWith("data:model/gltf-binary;base64,"),
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
  floorId: floorIdSchema,
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
  floorId: floorIdSchema,
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
  floorId: floorIdSchema,
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
  floorId: floorIdSchema,
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
  /**
   * The next service point in a chain (ADR-0017, batch 5.2 of the
   * gap-closure plan) — "security check, then ticket gate, then escalator"
   * as one queueing network. Absent: served here ends the chain, the same
   * as every service point behaved before this field existed.
   */
  nextServicePointId: idSchema.optional(),
  /**
   * Windows this point admits nobody new (still finishes whoever it was
   * already serving) — a scripted outage, not a live fault model. Default
   * empty: never down, unchanged from before this field existed.
   */
  outageWindows: z
    .array(
      z
        .object({
          startsAtSeconds: z.number().nonnegative(),
          endsAtSeconds: z.number().positive(),
        })
        .refine(
          (window) => window.endsAtSeconds > window.startsAtSeconds,
          "outage end must be after its start",
        ),
    )
    .default([]),
});

export const countLineSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
  geometry: z.object({
    type: z.literal("polyline"),
    points: z.array(pointSchema).length(2),
  }),
});

/**
 * A way between two floors: stairs, an escalator, or a lift (ADR-0010, stages
 * 2 and 6).
 *
 * A lift is a queue with a batch service — people wait, a car arrives, some
 * number board, it travels, they get out — modelled that way (`floorTransfers`'s
 * `stepElevatorTravel`), not as a sloped walk. **One connector is one shaft
 * between exactly two floors.** A bank that serves three or more floors is
 * declared as one elevator connector per adjacent pair it actually stops at —
 * independent shafts and car pools, not one car skipping floors — which is a
 * disclosed simplification: a real bank's single car serving floors 1, 2 and 3
 * can be nearer for a 1→3 trip than two separate shafts waiting at floor 2 in
 * between would be. Dispatch is the simplest rule that is still a rule, not a
 * fixed order: an idle car already at the calling floor answers it; otherwise
 * whichever idle car is first in `carCount` order is sent for it — not the
 * lookahead a real controller uses (predicting who else it can serve on the
 * way, balancing cars across a whole bank), and the code says so where it is.
 */
export const connectorSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  kind: z.enum(["stair", "escalator", "elevator"]),
  /** Where someone steps on, and which floor they step on from. */
  from: z.object({ floorId: idSchema, point: pointSchema }),
  /** Where they step off, and onto which floor. */
  to: z.object({ floorId: idSchema, point: pointSchema }),
  /**
   * Clear walking width in metres. How many people a second it can pass is
   * this times Weidmann's peak specific flow — the same rule entrances use
   * (ADR-0008), because a stair mouth and a door are the same constraint.
   * Ignored for a lift, which is capacity- not width-limited (`capacity`).
   */
  width: z.number().positive().default(1.2),
  /**
   * Both ways, or only from `from` to `to`. An escalator runs one way; a
   * staircase is walked in both directions unless a scene says otherwise.
   * Ignored for a lift, whose car always serves both directions.
   */
  bidirectional: z.boolean().default(false),
  /**
   * Travel speed along the flight, m/s. Absent: a literature-typical value for
   * the kind (see `connectorTravelSeconds`), **not calibrated here**.
   */
  speedMetersPerSecond: z.number().positive().optional(),
  /** A lift car's own passenger limit. Ignored for stairs and escalators. */
  capacity: z.number().int().positive().default(8),
  /** Cars sharing this shaft. Ignored for stairs and escalators. */
  carCount: z.number().int().positive().default(1),
  /**
   * Seconds a car's doors stay open at a stop to let people off and on.
   * Self-chosen, a round number in the range ordinary dwell-plus-door-cycle
   * times are usually quoted at — not a standard's own figure, and not
   * calibrated. Ignored for stairs and escalators.
   */
  doorSeconds: z.number().nonnegative().default(4),
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
