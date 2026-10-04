/**
 * Whether two ECharts options say the same thing.
 *
 * Every chart panel builds its option inline in JSX, so `option` is a new
 * object on every render — and the stage re-renders once per tick (~60 Hz)
 * while the numbers behind these charts change four times a second
 * (`useRunSeries` samples on a 250 ms interval). Without this comparison every
 * chart was told to redraw itself sixty times a second to draw the same
 * picture.
 *
 * Functions are compared by source, so a changed tooltip formatter (two of the
 * scatter charts carry one) still counts as a change rather than being dropped
 * by the serialisation.
 */
export function sameChartOption(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, optionReplacer) === JSON.stringify(b, optionReplacer);
}

function optionReplacer(_key: string, value: unknown) {
  return typeof value === "function" ? value.toString() : value;
}
