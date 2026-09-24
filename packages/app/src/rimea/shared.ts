/**
 * RiMEA's verification tests, and how far this engine has been put through
 * them (gap-closure plan 1.2).
 *
 * SOURCE: RiMEA — Richtlinie für Mikroskopische Entfluchtungsanalysen /
 * Guideline for Microscopic Evacuation Analysis, **version 4.1.1 of
 * 11.09.2025**, RiMEA e.V., www.rimea.de, licensed CC BY-ND 4.0. Annex 1
 * ("Provisional instructions for the validation / verification of simulation
 * programs") defines **sixteen** tests across A 2 (components), A 3
 * (functional) and A 4 (qualitative). Page numbers below are that edition's.
 *
 * Only the parameters of each test are recorded here — geometry, densities,
 * time windows — with the clause they come from. The guideline's own text is
 * not reproduced, and the German version is the authoritative one.
 *
 * **Read the status field before the numbers.** RiMEA 3.0 defines fourteen
 * tests, each with its own geometry and acceptance criterion. Only a test
 * whose geometry and criterion have been taken **from the standard's own
 * text** can be said to have been run, and this file is explicit about which
 * those are:
 *
 * - `run` — the geometry and the criterion are recorded here with their
 *   source, the engine was measured against them, and the result is whatever
 *   it is. A failure stays a failure; nothing here is tuned until it passes.
 * - `needs-scenario` — the parameters are recorded, and the scenario that
 *   would exercise them has not been built yet. Each one says what it needs. The scenarios in
 *   `benchmarkScenarios.ts` are named after RiMEA tests but say in their own
 *   header that they are **not** RiMEA geometry; they are regression guards.
 *
 * So this suite is a statement of position, not a certificate. It exists so
 * that "which RiMEA tests does it pass?" has an answer that is checked by
 * code rather than remembered.
 *
 * This one file grew to 3142 lines (one per RiMEA test plus the aggregator)
 * before being split for B5 (docs/superpowers/plans/2026-09-24-open-source-and-ux-overhaul-plan.md
 * §6.1 row 2) into `packages/app/src/rimea/`, one module per test named
 * `testNN*.ts`, plus this `shared.ts` for the handful of pieces more than one
 * test's file needs, and `suite.ts` for the aggregator. `../rimeaSuite.ts`
 * re-exports everything from here so no other file's imports had to change.
 */

export type RimeaStatus = "pass" | "fail" | "needs-scenario";

/** The one place this status vocabulary is translated, so the detailed list
 * and the status-grid tiles in RimeaReportPanel.tsx can't drift apart. */
export const rimeaStatusLabel: Record<"en" | "zh", Record<RimeaStatus, string>> = {
  en: { fail: "FAIL", "needs-scenario": "NOT BUILT", pass: "PASS" },
  zh: { fail: "未通过", "needs-scenario": "未实现", pass: "通过" },
};

export type RimeaTestResult = {
  /** RiMEA's own numbering. */
  number: number;
  title: string;
  status: RimeaStatus;
  /** What was measured, when it was. */
  measured?: string;
  /** What it was measured against, and where that came from. */
  criterion?: string;
  /** Why it has not been attempted, for the two "needs" statuses. */
  blockedBy?: string;
};

/**
 * A door or exit opening, wider than the guideline's own — a router
 * workaround, not a claim about the door. `crowdNavigation.ts`'s routing
 * grid floor (`routeCellSizeMeters`) was 1 m when this substitution was
 * introduced, and a wall segment marks every cell it so much as touches; two
 * segments bounding a ~1 m gap can between them mark both of the gap's own
 * cells, sealing it regardless of where exactly it sits. Verified directly:
 * a 1 m gap on this grid let nobody through in a 60 s check; 2.4 m did.
 *
 * The floor has since been lowered to 0.2 m (`crowdNavigation.ts`'s own
 * comment on `routeCellSizeMeters`/`maxRouteCells`), verified to resolve
 * doors down to 0.8 m — but only on small worlds; on a world large enough to
 * hit the `maxRouteCells` cap the cell size coarsens back past the point an
 * 0.8 m door stays reliably resolvable, and these RiMEA scenes have not been
 * individually re-measured against that cap to say which side of it they
 * fall on. Reverting to the guideline's own door widths here is therefore
 * left as separate, explicit follow-up work — re-measuring and re-tuning
 * each test's own pass criterion against real literature widths, not a
 * one-line substitution to undo alongside a router fix. Sinks are not
 * throughput-gated in this engine (only sources are — ADR-0008), so widening
 * a wall opening changes nothing being measured by tests 8, 9 and 11, which
 * all share this substitution; each says so in its own criterion string.
 */
export const routingGapMeters = 2.4;

/** A wall built from raw coordinates -- shared by tests 8 and 13, the two
 * that build a multi-room/multi-floor building wall by wall rather than as
 * a handful of named polygons. */
export type WallInput = {
  id: string;
  floorId: string;
  geometry: { type: "polyline"; points: { x: number; y: number }[] };
};

export function wallLine(
  id: string,
  floorId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): WallInput {
  return {
    id,
    floorId,
    geometry: {
      type: "polyline",
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ],
    },
  };
}
