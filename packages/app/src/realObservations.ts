import { findOptionalColumnIndex, parseCsv, parseFiniteNumber } from "./csvParsing";
import type { MinuteFlow, RunAnalyticsSummary } from "./runAnalytics";

/**
 * Real, human-collected counts imported to sit next to this project's own
 * simulated output — gap-closure plan batch 4.2. This is the prerequisite
 * the plan itself names for data assimilation (particle filter / EnKF): a
 * plain count-by-count comparison, computed once against whatever the
 * simulation has measured so far, not a filter that feeds corrections back
 * into the running simulation. That remains future work.
 *
 * Two formats, because the two things a site typically has counts from are
 * shaped differently:
 * - **Line counts** (turnstile or camera tallies) share the exact column
 *   shape this project's own `runAnalytics.ts` `flows` CSV export already
 *   uses (`line_id,line_name,minute_start_s,forward,backward`) — a real
 *   dataset can be authored by editing that export's numbers, and the two
 *   sides compare minute-by-minute.
 * - **POS receipts** are raw per-transaction timestamps, which this module
 *   only ever buckets into a *total* transaction count per place — the
 *   simulation's own `places` summary is a whole-run total too (it has no
 *   per-minute service-completion series), so a per-minute receipt
 *   comparison is not attempted; disclosed here rather than silently
 *   producing an average that reads like more precision than exists.
 */

export type ObservedLineCount = {
  lineId: string;
  lineName: string;
  minuteStartSeconds: number;
  forward: number;
  backward: number;
};

const lineCountAliases = {
  backward: ["backward", "out", "exits", "count_out"],
  forward: ["forward", "in", "entries", "count_in"],
  minuteStartSeconds: ["minute_start_s", "minute_start", "timestamp_s", "time_s"],
};
const lineIdAliases = ["line_id", "id", "gate_id", "turnstile_id", "camera_id"];
const lineNameAliases = ["line_name", "name", "gate_name", "label"];

export function parseLineCountObservationsCsv(csv: string): ObservedLineCount[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error("Line count CSV must include a header and at least one row");
  }

  const headers = rows[0].map((header) => header.trim());
  const idIndex = findOptionalColumnIndex(headers, lineIdAliases);
  const nameIndex = findOptionalColumnIndex(headers, lineNameAliases);
  if (idIndex === undefined && nameIndex === undefined) {
    throw new Error(
      `Line count CSV is missing '${lineIdAliases[0]}' or '${lineNameAliases[0]}' column`,
    );
  }
  const minuteIndex = requireColumn(
    headers,
    lineCountAliases.minuteStartSeconds,
    "Line count CSV",
  );
  const forwardIndex = requireColumn(
    headers,
    lineCountAliases.forward,
    "Line count CSV",
  );
  const backwardIndex = requireColumn(
    headers,
    lineCountAliases.backward,
    "Line count CSV",
  );

  const observations: ObservedLineCount[] = [];
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    if (row.length === 0 || row.every((cell) => cell.trim().length === 0)) continue;
    const rowNumber = rowIndex + 2;
    const id = idIndex !== undefined ? row[idIndex]?.trim() : undefined;
    const name = nameIndex !== undefined ? row[nameIndex]?.trim() : undefined;
    if (!id && !name) {
      throw new Error(`Line count row ${rowNumber} has neither a line id nor a name`);
    }
    observations.push({
      backward: parseFiniteNumber(row[backwardIndex], rowNumber, "backward"),
      forward: parseFiniteNumber(row[forwardIndex], rowNumber, "forward"),
      lineId: id || (name as string),
      lineName: name || (id as string),
      minuteStartSeconds: parseFiniteNumber(
        row[minuteIndex],
        rowNumber,
        "minute_start_s",
      ),
    });
  }
  return observations;
}

export type ObservedReceipt = { placeId: string; timestampSeconds: number };

const receiptAliases = {
  placeId: ["place_id", "store_id", "shop_id", "id"],
  timestampSeconds: ["timestamp_s", "time_s", "timestamp"],
};

export function parseReceiptTimestampsCsv(csv: string): ObservedReceipt[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    throw new Error("Receipt CSV must include a header and at least one row");
  }

  const headers = rows[0].map((header) => header.trim());
  const placeIndex = requireColumn(headers, receiptAliases.placeId, "Receipt CSV");
  const timeIndex = requireColumn(
    headers,
    receiptAliases.timestampSeconds,
    "Receipt CSV",
  );

  const receipts: ObservedReceipt[] = [];
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    if (row.length === 0 || row.every((cell) => cell.trim().length === 0)) continue;
    const rowNumber = rowIndex + 2;
    const placeId = row[placeIndex]?.trim();
    if (!placeId) {
      throw new Error(`Receipt row ${rowNumber} is missing a place id`);
    }
    receipts.push({
      placeId,
      timestampSeconds: parseFiniteNumber(row[timeIndex], rowNumber, "timestamp_s"),
    });
  }
  return receipts;
}

export type LineCountComparisonRow = {
  lineId: string;
  lineName: string;
  minuteStartSeconds: number;
  observedForward: number | null;
  observedBackward: number | null;
  simulatedForward: number | null;
  simulatedBackward: number | null;
};

/**
 * Matches observed and simulated per-minute counts by line id (falling back
 * to name, since a hand-authored real dataset may not know this scene's
 * internal ids) and by minute. A minute present on only one side keeps that
 * side's numbers and leaves the other `null` — reported as a gap, not
 * silently treated as zero, since a missing minute usually means nobody
 * recorded it rather than nobody crossed.
 */
export function compareLineCounts(
  observed: readonly ObservedLineCount[],
  simulated: readonly MinuteFlow[],
): LineCountComparisonRow[] {
  const minuteKey = (token: string, minute: number) => `${token}::${minute}`;

  // Every simulated (id, minute) and (name, minute) key points at the same
  // row object, so an observation matching by either resolves to it.
  const byId = new Map<string, LineCountComparisonRow>();
  const byName = new Map<string, LineCountComparisonRow>();

  for (const flow of simulated) {
    const row: LineCountComparisonRow = {
      lineId: flow.id,
      lineName: flow.name,
      minuteStartSeconds: flow.minuteStartSeconds,
      observedBackward: null,
      observedForward: null,
      simulatedBackward: flow.backward,
      simulatedForward: flow.forward,
    };
    byId.set(minuteKey(flow.id, flow.minuteStartSeconds), row);
    byName.set(minuteKey(flow.name, flow.minuteStartSeconds), row);
  }

  const extraRows: LineCountComparisonRow[] = [];

  for (const observation of observed) {
    const existing =
      byId.get(minuteKey(observation.lineId, observation.minuteStartSeconds)) ??
      byName.get(minuteKey(observation.lineName, observation.minuteStartSeconds));

    if (existing) {
      existing.observedForward = observation.forward;
      existing.observedBackward = observation.backward;
    } else {
      extraRows.push({
        lineId: observation.lineId,
        lineName: observation.lineName,
        minuteStartSeconds: observation.minuteStartSeconds,
        observedBackward: observation.backward,
        observedForward: observation.forward,
        simulatedBackward: null,
        simulatedForward: null,
      });
    }
  }

  const rows = [...new Set(byId.values()), ...extraRows];
  return rows.sort(
    (a, b) =>
      a.lineName.localeCompare(b.lineName) ||
      a.minuteStartSeconds - b.minuteStartSeconds,
  );
}

export type LineCountComparisonSummary = {
  matchedMinutes: number;
  observedOnlyMinutes: number;
  simulatedOnlyMinutes: number;
  meanAbsoluteError: number;
  totalObserved: number;
  totalSimulated: number;
};

/** Aggregates a comparison into one headline: how many minutes had both
 * sides to compare, and the mean absolute error over those (forward and
 * backward pooled into one error term per minute). Minutes with only one
 * side are counted but excluded from the error, not scored as a miss --
 * that would conflate "recorded nothing" with "predicted wrong". */
export function summarizeLineCountComparison(
  rows: readonly LineCountComparisonRow[],
): LineCountComparisonSummary {
  let matchedMinutes = 0;
  let observedOnlyMinutes = 0;
  let simulatedOnlyMinutes = 0;
  let absoluteErrorSum = 0;
  let totalObserved = 0;
  let totalSimulated = 0;

  for (const row of rows) {
    // observedForward/observedBackward (and the simulated pair) are always
    // written together, never independently null -- see compareLineCounts
    // above, the only place a row is built. Checking only the *Forward half
    // here is enough to guard both non-null assertions below.
    const hasObserved = row.observedForward !== null;
    const hasSimulated = row.simulatedForward !== null;
    if (hasObserved) totalObserved += row.observedForward! + row.observedBackward!;
    if (hasSimulated) totalSimulated += row.simulatedForward! + row.simulatedBackward!;

    if (hasObserved && hasSimulated) {
      matchedMinutes++;
      absoluteErrorSum +=
        Math.abs(row.observedForward! - row.simulatedForward!) +
        Math.abs(row.observedBackward! - row.simulatedBackward!);
    } else if (hasObserved) {
      observedOnlyMinutes++;
    } else {
      simulatedOnlyMinutes++;
    }
  }

  return {
    matchedMinutes,
    meanAbsoluteError: matchedMinutes > 0 ? absoluteErrorSum / (matchedMinutes * 2) : 0,
    observedOnlyMinutes,
    simulatedOnlyMinutes,
    totalObserved,
    totalSimulated,
  };
}

export type PosComparisonRow = {
  placeId: string;
  observedTransactions: number;
  simulatedServiceVisits: number | null;
};

/** Total transactions per place, from raw receipts, against the run's own
 * whole-run `service` visit count for that place -- there is no per-minute
 * comparison here (see this module's own doc comment for why). */
export function comparePosReceipts(
  receipts: readonly ObservedReceipt[],
  simulatedPlaces: RunAnalyticsSummary["places"],
): PosComparisonRow[] {
  const observedByPlace = new Map<string, number>();
  for (const receipt of receipts) {
    observedByPlace.set(
      receipt.placeId,
      (observedByPlace.get(receipt.placeId) ?? 0) + 1,
    );
  }

  const simulatedByPlace = new Map(
    simulatedPlaces
      .filter((place) => place.kind === "service")
      .map((place) => [place.placeId, place.visits]),
  );

  const placeIds = new Set([...observedByPlace.keys(), ...simulatedByPlace.keys()]);
  return [...placeIds]
    .map((placeId) => ({
      observedTransactions: observedByPlace.get(placeId) ?? 0,
      placeId,
      simulatedServiceVisits: simulatedByPlace.get(placeId) ?? null,
    }))
    .sort((a, b) => a.placeId.localeCompare(b.placeId));
}

function requireColumn(
  headers: readonly string[],
  aliases: readonly string[],
  context: string,
): number {
  const index = findOptionalColumnIndex(headers, aliases);
  if (index === undefined) {
    throw new Error(`${context} is missing '${aliases[0]}' column`);
  }
  return index;
}
