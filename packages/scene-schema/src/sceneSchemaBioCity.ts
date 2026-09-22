import { z } from "zod";
import {
  customParametersSchema,
  floorIdSchema,
  idSchema,
  openingHoursSchema,
  pointSchema,
  polygonSchema,
  polylineSchema,
  visual2d5Schema,
} from "./sceneSchemaBase";

export const roadSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
  geometry: polylineSchema,
  widthMeters: z.number().positive().default(6),
  direction: z.enum(["oneWayBackward", "oneWayForward", "twoWay"]).default("twoWay"),
  // Note: despite the name, this has always defaulted to a walking speed
  // (1.4 m/s) and had no live consumer — a cosmetic leftover, not vehicle
  // config. `vehicleSpeedLimitMetersPerSecond` below is the real one (ADR-0016);
  // this field is left as-is to avoid changing any scene that reads it today.
  speedLimitMetersPerSecond: z.number().positive().default(1.4),
  capacityPerMinute: z.number().nonnegative().default(180),
  walkable: z.boolean().default(true),
  transitOnly: z.boolean().default(false),
  /**
   * Whether SP-3 stage 1 vehicle simulation (ADR-0016) spawns and drives
   * vehicles on this road at all. Default false: an existing scene's roads
   * stay exactly as decorative as they always were until an author opts in.
   */
  vehicleAccessible: z.boolean().default(false),
  /** Vehicles spawned per minute, per direction of travel. 0 (default):
   * no spawning even if `vehicleAccessible` is true. */
  vehicleArrivalRatePerMinute: z.number().nonnegative().default(0),
  /** ~30 km/h, a plausible urban default — not fitted or measured (ADR-0016). */
  vehicleSpeedLimitMetersPerSecond: z.number().positive().default(8.33),
  customParameters: customParametersSchema,
  visual: visual2d5Schema,
});

/**
 * A marked place a pedestrian may be crossing a vehicle-accessible road
 * (ADR-0016, SP-3 stage 1) — not a routing target (pedestrians are not
 * steered to use it; roads are not part of the pedestrian navigation grid),
 * only a point vehicles on `roadId` check for an occupying pedestrian and
 * yield to.
 */
export const crosswalkSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
  roadId: idSchema,
  position: pointSchema,
  widthMeters: z.number().positive().default(3),
  visual: visual2d5Schema,
});

export const buildingKindSchema = z.enum([
  "civic",
  "mixedUse",
  "office",
  "residential",
  "retail",
  "shelter",
  "transit",
  "utility",
]);

export const buildingSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
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

export const transitStopSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
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

export const obstacleSchema = z.object({
  id: idSchema,
  name: z.string().min(1).optional(),
  floorId: floorIdSchema,
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

export const hazardSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).optional(),
    floorId: floorIdSchema,
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
    /**
     * Seconds from `startsAtSeconds` for the affected radius to grow from 0
     * to `radiusMeters` (`smokeHazards.smokeRadiusAt`) — only meaningful for
     * `kind: "fire"`/`"smoke"`, ignored otherwise. Self-chosen (2 minutes),
     * not fitted to any measured fire growth curve; this project has none.
     */
    growthSeconds: z.number().positive().default(120),
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

export const weatherSampleSchema = z.object({
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

export const weatherProfileSchema = z
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

export const cityEventSchema = z
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

export const eventTimelineSchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().min(1).optional(),
    startsAtIso: z.string().datetime().optional(),
    timeScale: z.number().positive().default(1),
    events: z.array(cityEventSchema).default([]),
    customParameters: customParametersSchema,
  })
  .default({ customParameters: {}, events: [], timeScale: 1 });

export const bioAgentProfileSchema = z.object({
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

export const sceneVisualSchema = z
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
