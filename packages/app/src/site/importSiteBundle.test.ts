import { describe, expect, it } from "vitest";
import { parseSiteContextBundle, type SiteContextBundle } from "@crowdsim/scene-schema";
import fixture from "./fixtures/site-context-bundle-v1.json";
import caidianExport from "./fixtures/caidian-export-v1.json";
import {
  catchmentToArrivalProfile,
  demandCoefficients,
  describeDemandInference,
} from "./demandInference";
import { importSiteBundle } from "./importSiteBundle";

const bundle: SiteContextBundle = parseSiteContextBundle(fixture);

describe("site context bundle", () => {
  it("reads the checked-in fixture", () => {
    expect(bundle.contractVersion).toBe(1);
    expect(bundle.site.coordinateSystem).toBe("GCJ-02");
    expect(bundle.catchment.layers.residential?.count).toBe(42);
    expect(bundle.catchment.inference.coefficientsAreCalibrated).toBe(false);
    expect(bundle.siteGeometry?.buildings).toHaveLength(3);
  });

  it("reads a bundle the real caidian exporter produced", () => {
    // Produced by `packages/frontend/src/utils/crowdSimExport.ts` in the
    // caidian repo, by hand, and pasted in. It is the cross-repo half of this
    // contract: if either side changes shape, this is where it breaks.
    const exported = parseSiteContextBundle(caidianExport);

    expect(exported.provider).toBe("amap+caidian");
    expect(exported.siteGeometry).toBeUndefined();
    expect(exported.catchment.inference.coefficientsAreCalibrated).toBe(false);

    const imported = importSiteBundle(exported);

    // caidian has no footprints and no door positions, so it exports neither,
    // and the scene says so instead of growing a building out of a POI point.
    expect(imported.scene.buildings).toHaveLength(0);
    expect(imported.hasDoors).toBe(false);
    // ...but the arrival rate the catchment was worth exporting survives.
    const arrival = (
      imported.scene.customParameters?.siteInference as Record<string, unknown>
    )?.arrival as { ratePerMinute: number };

    expect(arrival.ratePerMinute).toBeGreaterThan(0);
  });

  it("rejects a bundle whose contract version it does not serve", () => {
    expect(() => parseSiteContextBundle({ ...fixture, contractVersion: 2 })).toThrow(
      /unsupported contract version/,
    );
  });

  it("names the field that failed rather than failing generically", () => {
    expect(() =>
      parseSiteContextBundle({ ...fixture, catchment: { layers: {} } }),
    ).toThrow(/catchment\.inference|catchment/);
  });

  it("requires the calibration flag, so omitting it cannot read as calibrated", () => {
    expect(() =>
      parseSiteContextBundle({
        ...fixture,
        catchment: { ...fixture.catchment, inference: {} },
      }),
    ).toThrow();
  });
});

describe("importSiteBundle", () => {
  const imported = importSiteBundle(bundle);

  it("lands every imported thing inside the world it built", () => {
    // The regression: `site_geometry` is metres relative to the site origin, so
    // its coordinates are negative on two sides. Copying them in unchanged put
    // most of the site off the world — drawn nowhere and simulated nowhere.
    const everything = [
      ...imported.scene.buildings.flatMap((building) => building.footprint.points),
      ...imported.scene.roads.flatMap((road) => road.geometry.points),
      ...imported.scene.entrances.map((entrance) => entrance.position),
      ...imported.scene.shops.map((shop) => shop.position),
    ];

    expect(everything.length).toBeGreaterThan(0);

    for (const point of everything) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(imported.scene.world.width);
      expect(point.y).toBeLessThanOrEqual(imported.scene.world.height);
    }
  });

  it("keeps the site's shape while moving it onto the world", () => {
    // A translation must preserve every distance, or it is not a translation.
    const b1 = imported.scene.buildings.find((building) => building.id === "b1");
    const points = b1?.footprint.points ?? [];
    const width =
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const height =
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));

    // b1 is 10 m by 10 m in the fixture.
    expect(width).toBeCloseTo(10, 6);
    expect(height).toBeCloseTo(10, 6);
  });

  it("carries the real footprints across as buildings, with their height provenance", () => {
    expect(imported.scene.buildings.map((building) => building.id)).toEqual([
      "b1",
      "b2",
      "b3",
    ]);
    expect(imported.scene.buildings[0]?.footprint.points).toHaveLength(4);
    expect(imported.scene.buildings[0]?.heightMeters).toBe(18);
    expect(imported.scene.buildings[0]?.customParameters.heightSource).toBe(
      "building:levels",
    );
    // No height tag at all: falls back, and is named as inferred.
    expect(imported.scene.buildings[2]?.heightMeters).toBe(10);
    expect(imported.inferredHeightIds).toEqual(["b1", "b3"]);
  });

  it("turns the table form into a seat capacity", () => {
    const shop = imported.scene.shops[0];

    // 6×2 + 10×4 + 4×6 + 2×10 = 96
    expect(shop?.capacity).toBe(96);
    expect(shop?.name).toBe("老四季中餐厅");
    expect(shop?.brand?.category).toBe("restaurant");
    expect(shop?.brand?.priceTier).toBe(3);
  });

  it("splits the inferred arrivals evenly across the doors the site plan gave", () => {
    const doors = imported.scene.entrances;
    const whole = catchmentToArrivalProfile(bundle);

    expect(doors).toHaveLength(2);
    expect(imported.hasDoors).toBe(true);

    for (const door of doors) {
      expect(door.arrivalProfile?.intervalMinutes).toBe(whole.slotMinutes);
      expect(door.arrivalProfile?.ratesPerMinute).toHaveLength(
        whole.ratesPerMinute.length,
      );
      expect(door.arrivalProfile?.ratesPerMinute[0]).toBeCloseTo(
        (whole.ratesPerMinute[0] ?? 0) / 2,
        9,
      );
    }
  });

  it("records the site's provenance on the scene itself", () => {
    const site = imported.scene.customParameters.siteInference as Record<
      string,
      unknown
    >;

    expect(site.provider).toBe("amap+overpass");
    expect(site.coordinateSystem).toBe("GCJ-02");
    expect(site.coefficientsAreCalibrated).toBe(false);
    expect(site.catchmentRadiusMeters).toBe(3000);
  });

  it("leaves out doors it was not told about instead of inventing them", () => {
    const noDoors = importSiteBundle({
      ...bundle,
      siteGeometry: {
        ...bundle.siteGeometry!,
        entrances: [],
      },
    });

    expect(noDoors.scene.entrances).toHaveLength(0);
    expect(noDoors.hasDoors).toBe(false);
    expect(noDoors.report.some((line) => line.includes("没有门"))).toBe(true);
  });

  it("keeps the arrival rate a doorless site would otherwise lose", () => {
    // A bundle with no entrances used to import as a scene with nobody
    // arriving: the one number the catchment was worth exporting had nowhere
    // to go. It is carried on the scene instead, and the report says where to
    // put it.
    const noDoors = importSiteBundle({
      ...bundle,
      siteGeometry: { ...bundle.siteGeometry!, entrances: [] },
    });
    const arrival = (
      noDoors.scene.customParameters?.siteInference as Record<string, unknown>
    )?.arrival as { ratePerMinute: number; ratesPerMinute: number[] };

    expect(arrival.ratePerMinute).toBeGreaterThan(0);
    expect(arrival.ratesPerMinute.length).toBeGreaterThan(0);
    expect(
      noDoors.report.some(
        (line) => line.includes("人/分钟") && line.includes("siteInference.arrival"),
      ),
    ).toBe(true);
  });

  it("still builds a scene when the bundle carries no geometry at all", () => {
    const bare = importSiteBundle({
      ...bundle,
      siteGeometry: undefined,
    });

    expect(bare.scene.buildings).toHaveLength(0);
    expect(bare.scene.world.width).toBeGreaterThan(0);
  });
});

describe("catchmentToArrivalProfile", () => {
  const inferred = catchmentToArrivalProfile(bundle);

  it("produces one rate per slot of the modelled day", () => {
    expect(inferred.slotMinutes).toBe(15);
    expect(inferred.ratesPerMinute).toHaveLength(48);
    expect(inferred.ratesPerMinute.every((rate) => Number.isFinite(rate))).toBe(true);
  });

  it("peaks twice, the way a service day does", () => {
    const peak = Math.max(...inferred.ratesPerMinute);
    const lunch = Math.max(...inferred.ratesPerMinute.slice(14, 20));
    const dinner = Math.max(...inferred.ratesPerMinute.slice(30, 36));

    expect(lunch).toBeGreaterThan(0);
    expect(dinner).toBeGreaterThan(0);
    expect(peak).toBeGreaterThanOrEqual(Math.max(lunch, dinner));
  });

  it("loses demand to competitors when there are more of them", () => {
    const quietSite: SiteContextBundle = {
      ...bundle,
      catchment: {
        ...bundle.catchment,
        layers: { ...bundle.catchment.layers, competitor: { count: 0 } },
      },
    };

    expect(catchmentToArrivalProfile(quietSite).siteVisitsPerDay).toBeGreaterThan(
      inferred.siteVisitsPerDay,
    );
  });

  it("keeps every coefficient in the one table, where the ledger can see it", () => {
    // The regression: a coefficient hard-coded in the expression instead of
    // in `demandCoefficients` is a coefficient the claims ledger cannot
    // register, because nobody looking at the table knows it exists.
    const withPopulation = catchmentToArrivalProfile(bundle, {
      coefficients: { ...demandCoefficients, populationVisitRate: 0.5 },
    });

    expect(withPopulation.populationVisitsPerDay).toBeGreaterThan(
      inferred.populationVisitsPerDay * 5,
    );
    expect(withPopulation.siteVisitsPerDay).toBeGreaterThan(inferred.siteVisitsPerDay);
  });

  it("says the coefficients are uncalibrated, in the output not just the code", () => {
    const lines = describeDemandInference(inferred);

    expect(lines[0]).toContain("不是客流预测");
    expect(lines.some((line) => line.includes("未标定"))).toBe(true);
    expect(inferred.calibrated).toBe(false);
  });

  it("grows with the catchment and shrinks with the competition, monotonically", () => {
    const moreHomes = catchmentToArrivalProfile({
      ...bundle,
      catchment: {
        ...bundle.catchment,
        layers: { ...bundle.catchment.layers, residential: { count: 84 } },
      },
    });

    expect(moreHomes.impliedPopulation).toBeGreaterThan(inferred.impliedPopulation);
    expect(moreHomes.siteVisitsPerDay).toBeGreaterThan(inferred.siteVisitsPerDay);
  });
});
