/** Escapes text for safe interpolation into an HTML string template — the
 * same escaping every report-rendering module in this project needs.
 * Extracted from `validationReport.ts` once `scenarioDiffReport.ts` gave it
 * a second real caller. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
