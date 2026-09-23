import { rimeaStatusLabel, type RimeaTestResult } from "./rimeaSuite";

/**
 * All sixteen RiMEA tests as one glance: a tile per test, coloured by
 * status, sorted by RiMEA's own numbering. The detailed list below it (each
 * test's measured value or why it was not attempted) stays the panel's
 * source of precision -- this is only the shape.
 */
export function RimeaStatusGrid({
  language,
  results,
}: {
  language: "en" | "zh";
  results: readonly RimeaTestResult[];
}) {
  const text = rimeaStatusLabel[language];
  const sorted = [...results].sort((left, right) => left.number - right.number);
  const title = language === "zh" ? "16 条一览" : "All 16 at a glance";

  return (
    <div className="rimea-status-grid" role="img" aria-label={title}>
      {sorted.map((result) => (
        <span
          key={result.number}
          className={`rimea-tile rimea-tile-${result.status}`}
          title={`${result.number}. ${result.title} — ${text[result.status]}`}
        >
          {result.number}
        </span>
      ))}
    </div>
  );
}
