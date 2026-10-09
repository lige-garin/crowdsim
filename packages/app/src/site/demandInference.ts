import type { SiteContextBundle } from "@crowdsim/scene-schema";

/**
 * Catchment counts → arrivals at the site door, per time slot.
 *
 * Read the header before reading any number this produces.
 *
 * Every coefficient in `demandCoefficients` is **self-chosen and
 * uncalibrated**. Not one of them is fitted to a measurement, and the tool
 * this contract was written against (caidian, 2026-06-05) ships its own
 * estimates with `coefficientsAreCalibrated: false` for the same reason. The
 * chain from "42 residential POIs" to "3.1 people a minute at the door" has
 * four steps and every one of them is a guess:
 *
 *   1. POI count → people (households per compound, persons per household,
 *      workers per office tower).
 *   2. People → visits a day (a capture rate that exists nowhere in either
 *      codebase).
 *   3. Visits a day → arrivals per slot (the lunch/dinner peak shape — no
 *      time-of-day data at all).
 *   4. Competitors → share of demand lost (no quantitative rule exists).
 *
 * What survives that is a *shape*: a scenario driven by real POI counts. It
 * is not a predicted footfall, and `describeDemandInference` says so in the
 * output rather than only in this comment.
 *
 * The honest use of this module is the one the rest of the pipeline is built
 * for: two sites, or two layouts, run through the same coefficients, compared
 * against each other. The coefficients cancel; the difference does not.
 */

export type DemandCoefficients = {
  /** Residents implied by one residential POI. */
  peoplePerResidentialPoi: number;
  /** Daytime workers implied by one office POI. */
  workersPerOfficePoi: number;
  /** People implied by one school POI. */
  peoplePerSchoolPoi: number;
  /** Daily visits implied by one transit POI (bus stop or metro station). */
  visitsPerTransitPoi: number;
  /** Daily visits implied by one competing POI's own draw. */
  visitsPerMallPoi: number;
  /**
   * Share of the catchment's residents and workers who go out at all on a
   * day. The population term has to be turned into visits before the capture
   * rate is applied, and nothing in either codebase estimates this either.
   */
  populationVisitRate: number;
  /**
   * Share of the catchment's implied visits a day that arrive at *this* site.
   * The weakest number in the table: nothing in either codebase estimates it.
   */
  captureRate: number;
  /** Share of demand kept when there is one competitor, applied per competitor. */
  competitorRetention: number;
};

/**
 * The coefficients, in one table, so the claims ledger has one thing to point
 * at.
 *
 * **Every one of them is self-chosen and uncalibrated.** None is fitted to a
 * measurement, and there is no citation to give — see
 * `docs/CLAIMS_LEDGER.md`, 2026-10-06. The figures are the same order of
 * magnitude as the exporting tool's so a bundle round-trips to a sane run;
 * they are copied for compatibility, not because that tool calibrated them.
 */
export const uncalibrated = "self-chosen, uncalibrated";

export const demandCoefficients: DemandCoefficients = {
  peoplePerResidentialPoi: 2100,
  workersPerOfficePoi: 560,
  peoplePerSchoolPoi: 780,
  visitsPerTransitPoi: 260,
  visitsPerMallPoi: 7600,
  populationVisitRate: 0.05,
  captureRate: 0.01,
  competitorRetention: 0.94,
};

/**
 * A day's shape: share of the day's visits falling in each slot.
 *
 * **Self-chosen, uncalibrated.** No time-of-day data exists anywhere in the
 * pipeline; this is a two-peak service-day curve so that a run has a lunch
 * rush and a dinner rush to plan around. It is a scenario, not a forecast.
 */
export function defaultDayShape(slotsPerDay: number): number[] {
  const slots = Math.max(1, Math.floor(slotsPerDay));
  const shape: number[] = [];

  for (let slot = 0; slot < slots; slot++) {
    // 0 at the start of the day, peaking near a third and two-thirds in.
    const t = slot / slots;
    const lunch = Math.exp(-((t - 0.36) ** 2) / 0.006);
    const dinner = Math.exp(-((t - 0.68) ** 2) / 0.008);
    shape.push(lunch + 0.9 * dinner + 0.05);
  }

  const total = shape.reduce((sum, value) => sum + value, 0);

  return shape.map((value) => value / total);
}

export type DemandInference = {
  /** Implied people in the catchment: residents plus daytime workers. */
  impliedPopulation: number;
  /**
   * Daily visits implied by the transit and mall POIs alone. **Not** the whole
   * demand the site draws from: the population's own share is added on top.
   */
  impliedVisitsPerDay: number;
  /** Daily visits implied by the catchment's population, before capture. */
  populationVisitsPerDay: number;
  /** Visits a day arriving at this site, after capture and competition. */
  siteVisitsPerDay: number;
  /** People a minute, one per slot, over `slotMinutes`-wide slots. */
  ratesPerMinute: number[];
  slotMinutes: number;
  /** Whether any of this came from calibrated coefficients. It did not. */
  calibrated: boolean;
  /** Competitors counted, which is the only layer read from real counts only. */
  competitorCount: number;
};

export type DemandInferenceOptions = {
  /** Slot width, minutes. Default 15. */
  slotMinutes?: number;
  /** Slots in the modelled day. Default 48 (a 12-hour day at 15 minutes). */
  slotsPerDay?: number;
  coefficients?: DemandCoefficients;
  /** True only when the supplied coefficients were fitted to measured footfall. */
  coefficientsAreCalibrated?: boolean;
};

/**
 * One pure function: a bundle in, an arrival profile out.
 *
 * Nothing here is measured. `describeDemandInference` returns the caveat
 * alongside the numbers so a caller cannot show one without the other.
 */
export function catchmentToArrivalProfile(
  bundle: SiteContextBundle,
  options: DemandInferenceOptions = {},
): DemandInference {
  return poiCountsToArrivalProfile(
    Object.fromEntries(
      Object.entries(bundle.catchment.layers).map(([key, layer]) => [
        key,
        layer?.count ?? 0,
      ]),
    ),
    options,
  );
}

export function poiCountsToArrivalProfile(
  counts: Readonly<Record<string, number>>,
  options: DemandInferenceOptions = {},
): DemandInference {
  const slotMinutes = options.slotMinutes ?? 15;
  const slotsPerDay = options.slotsPerDay ?? 48;
  const k = options.coefficients ?? demandCoefficients;
  const countOf = (key: string) => counts[key] ?? 0;

  const residents = countOf("residential") * k.peoplePerResidentialPoi;
  const workers = countOf("office") * k.workersPerOfficePoi;
  const schoolPeople = countOf("school") * k.peoplePerSchoolPoi;
  const transitVisits = (countOf("bus") + countOf("subway")) * k.visitsPerTransitPoi;
  const mallVisits = countOf("mall") * k.visitsPerMallPoi;

  const impliedPopulation = residents + workers + schoolPeople;
  // Visits the POIs themselves imply. Deliberately not the whole demand: the
  // population term is added below, so this field is the transit-and-mall part
  // and is not what `siteVisitsPerDay` is computed from on its own.
  const impliedVisitsPerDay = transitVisits + mallVisits;
  const populationVisits = impliedPopulation * k.populationVisitRate;
  const competitorCount = countOf("competitor");
  // Each competitor keeps a share of the demand; the retention compounds,
  // which is a modelling choice, not a measured one.
  const competitionShare = k.competitorRetention ** competitorCount;
  const siteVisitsPerDay =
    (impliedVisitsPerDay + populationVisits) * k.captureRate * competitionShare;

  const shape = defaultDayShape(slotsPerDay);
  const ratesPerMinute = shape.map((share) => (siteVisitsPerDay * share) / slotMinutes);

  return {
    impliedPopulation,
    impliedVisitsPerDay,
    populationVisitsPerDay: populationVisits,
    siteVisitsPerDay,
    ratesPerMinute,
    slotMinutes,
    calibrated: options.coefficientsAreCalibrated ?? false,
    competitorCount,
  };
}

/**
 * The inference as lines a reader can check — caveat first, because a number
 * read out of this without the caveat is the one thing it must not be used
 * for.
 */
export function describeDemandInference(inference: DemandInference): string[] {
  const lines = [
    "以下到达率由 POI 数量推断，系数未标定，不是客流预测，只能用于方案之间的相对比较。",
    `推断口径：常住人口+办公人口约 ${round(inference.impliedPopulation)} 人，` +
      `周边日均到访约 ${round(inference.impliedVisitsPerDay)} 人次，` +
      `竞品 ${inference.competitorCount} 个。`,
    `落到本店：约 ${round(inference.siteVisitsPerDay)} 人次/天，` +
      `拆成 ${inference.ratesPerMinute.length} 个 ${inference.slotMinutes} 分钟时段，` +
      `峰值 ${round(Math.max(...inference.ratesPerMinute, 0))} 人/分钟。`,
  ];

  if (!inference.calibrated) {
    lines.push(
      "系数来源：自拟未标定；只有导入实测入口计数后，相应入口曲线才属于实测输入。",
    );
  }

  return lines;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
