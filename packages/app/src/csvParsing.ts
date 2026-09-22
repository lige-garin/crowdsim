/**
 * The quote-aware CSV line splitter and column-alias resolver this project's
 * import paths share — originally written once for `trajectoryDataset.ts`,
 * extracted here so `realObservations.ts` reuses the same parsing instead of
 * a second copy (the same "extract, don't duplicate" call this session made
 * for `boundedNelderMead.ts`).
 */

export function parseCsv(csv: string): string[][] {
  return csv
    .trim()
    .split(/\r?\n/)
    .map((line) => splitCsvLine(line));
}

export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

export function parseFiniteNumber(
  value: string | undefined,
  rowNumber: number,
  field: string,
): number {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`row ${rowNumber} has invalid ${field} value`);
  }

  return number;
}

/**
 * Resolves a set of required columns from a CSV header row, tolerating any of
 * each field's known aliases (real-world exports rarely agree on column
 * names). Throws naming the first (preferred) alias when none of a field's
 * aliases are present.
 */
export function resolveColumnIndexes<Field extends string>(
  headers: readonly string[],
  aliasesByField: Record<Field, readonly string[]>,
): Record<Field, number> {
  return Object.fromEntries(
    Object.entries(aliasesByField).map(([field, aliases]) => {
      const list = aliases as readonly string[];
      const header = list.find((alias) => headers.includes(alias));

      if (!header) {
        throw new Error(`CSV is missing '${list[0]}' column`);
      }

      return [field, headers.indexOf(header)];
    }),
  ) as Record<Field, number>;
}

/** Same alias lookup as {@link resolveColumnIndexes}, but returns `undefined`
 * instead of throwing when none of the aliases are present, for a column a
 * format can do without. */
export function findOptionalColumnIndex(
  headers: readonly string[],
  aliases: readonly string[],
): number | undefined {
  const header = aliases.find((alias) => headers.includes(alias));
  return header ? headers.indexOf(header) : undefined;
}
