import { z } from "zod";
import {
  brandCategorySchema,
  customParametersSchema,
  idSchema,
} from "./sceneSchemaBase";

/**
 * The site context bundle: what a site-selection tool writes and CrowdSim
 * reads (ADR-0034 stage 1).
 *
 * It is a **file, not an API**. CrowdSim never calls a map provider; the
 * bundle arrives already fetched. That keeps the project's promise that a
 * default build makes no network requests, and it makes the seam a data
 * contract that can be versioned and tested against a checked-in fixture.
 *
 * Two domains live in here and they are not the same thing (ADR-0034 D2):
 *
 * - `catchment` is a ~3 km ring of POI counts. It decides *how many people
 *   arrive and who they are*. It contributes no geometry and no pedestrians.
 * - `site_geometry` is a ~300 m patch of real building footprints, in metres
 *   relative to `site.origin`. It is what gets simulated.
 *
 * The walk from a compound 2 km away is therefore not simulated at any point.
 * It is an arrival rate at the site boundary, which is honest: this project
 * models no car, bus or metro mode.
 */

/**
 * Where a building's height came from. Carried per building because OSM
 * `building:levels` coverage is patchy and a wrong height still looks
 * plausible; the importer marks an inferred height rather than presenting
 * one as surveyed.
 *
 * Two sources only, because two are all the chain produces: a tagged height,
 * or one derived from storey count (or, failing both, no height at all —
 * which is the importer's own default and is not a value here).
 */
export const heightSourceSchema = z.enum(["tags.height", "building:levels"]);

export const catchmentLayerSchema = z.object({
  count: z.number().int().nonnegative(),
  /** Distance-weighted count, as the exporting tool computes it. */
  weightedCount: z.number().nonnegative().optional(),
  /** Counts per ring, nearest first. */
  ringCounts: z.array(z.number().nonnegative()).optional(),
});

/**
 * The exporting tool's own estimates, carried across verbatim and never
 * recomputed here. They are a scoring heuristic's output, not a measurement,
 * and `catchment.inference` says so.
 */
export const catchmentEstimatesSchema = z.object({
  estimatedResidents: z.number().nonnegative().optional(),
  estimatedDaytimeWorkers: z.number().nonnegative().optional(),
  estimatedDailyFlow: z.number().nonnegative().optional(),
  competitionLevel: z.string().optional(),
  rentEstimate: z.string().optional(),
});

export const catchmentInferenceSchema = z.object({
  /**
   * Whether the coefficients behind the estimates were fitted to anything.
   * The one tool this contract was written against ships `false`, and it is
   * required rather than defaulted so that omitting it is not quietly read
   * as calibrated.
   */
  coefficientsAreCalibrated: z.boolean(),
  source: z.string().optional(),
});

export const siteCoordinateSystemSchema = z.enum(["GCJ-02", "WGS-84"]);

export const siteContextBundleSchema = z.object({
  contractVersion: z.literal(1),
  generatedAt: z.string().min(1),
  /** Which providers produced it, e.g. `"amap+overpass"`. */
  provider: z.string().min(1),
  site: z.object({
    address: z.string().optional(),
    coordinateSystem: siteCoordinateSystemSchema,
    origin: z.object({ lat: z.number(), lng: z.number() }),
    catchmentRadiusMeters: z.number().positive(),
    siteRadiusMeters: z.number().positive(),
  }),
  catchment: z.object({
    layers: z.record(z.string(), catchmentLayerSchema),
    estimates: catchmentEstimatesSchema.default({}),
    inference: catchmentInferenceSchema,
  }),
  siteGeometry: z
    .object({
      coordinateSystem: z.literal("local-meters"),
      buildings: z
        .array(
          z.object({
            id: idSchema,
            name: z.string().min(1).optional(),
            /** Closed ring, metres relative to `site.origin`, [x, y] pairs. */
            footprint: z.array(z.tuple([z.number(), z.number()])).min(3),
            heightMeters: z.number().positive().optional(),
            heightSource: heightSourceSchema.optional(),
          }),
        )
        .default([]),
      roads: z
        .array(
          z.object({
            id: idSchema,
            path: z.array(z.tuple([z.number(), z.number()])).min(2),
            kind: z.string().optional(),
            widthMeters: z.number().positive().optional(),
          }),
        )
        .default([]),
      /**
       * Doors onto the site, if the site plan says where they are. Absent:
       * the importer builds the scene with no doors rather than inventing
       * where a street entrance might be.
       */
      entrances: z
        .array(
          z.object({
            id: idSchema,
            name: z.string().min(1).optional(),
            position: z.tuple([z.number(), z.number()]),
            kind: z.enum(["source", "sink", "bidirectional"]).default("bidirectional"),
            widthMeters: z.number().positive().default(4),
          }),
        )
        .default([]),
    })
    .optional(),
  /** What the user typed into the shop form (ADR-0034 D6). */
  shop: z
    .object({
      name: z.string().min(1),
      category: brandCategorySchema.default("restaurant"),
      areaSquareMeters: z.number().positive(),
      averageTicketYuan: z.number().positive().optional(),
      tables: z
        .object({
          twoSeat: z.number().int().nonnegative().default(0),
          fourSeat: z.number().int().nonnegative().default(0),
          sixSeat: z.number().int().nonnegative().default(0),
          privateRoom10: z.number().int().nonnegative().default(0),
        })
        .default({
          twoSeat: 0,
          fourSeat: 0,
          sixSeat: 0,
          privateRoom10: 0,
        }),
      customParameters: customParametersSchema,
    })
    .optional(),
});

export type SiteContextBundle = z.infer<typeof siteContextBundleSchema>;

/**
 * Parse a bundle, with a message that names the field that failed.
 *
 * A wrong `contractVersion` is reported as such rather than swallowed: a
 * future v2 has to be a visible rejection, not a partial read that happens
 * to fill in the fields that still match.
 */
export function parseSiteContextBundle(input: unknown): SiteContextBundle {
  const result = siteContextBundleSchema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const first = result.error.issues[0];
  const path = first?.path.join(".") ?? "(root)";

  if (path === "contractVersion") {
    throw new Error(
      `Site context bundle declares an unsupported contract version: ` +
        `expected 1, got ${JSON.stringify((input as { contractVersion?: unknown })?.contractVersion)}`,
    );
  }

  throw new Error(`Site context bundle is invalid at '${path}': ${first?.message}`);
}
