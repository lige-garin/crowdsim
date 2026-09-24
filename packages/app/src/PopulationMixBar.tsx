import { getPedestrianPreset, type PedestrianPresetId } from "./pedestrianPresets";
import type { PopulationMix } from "./populationSampling";
import type { TranslationKey } from "./i18n";

/** Ten segments (`imoShipPassengerMix` has ten), cycled if a future library
 * entry has more. Colors just need to stay distinguishable side by side, not
 * mean anything on their own -- the legend text carries the meaning. */
const segmentColors = [
  "#2fd0ff",
  "#ff8a3d",
  "#7ee08c",
  "#c792ea",
  "#f4d35e",
  "#ff6b6b",
  "#5eead4",
  "#a78bfa",
  "#f97316",
  "#38bdf8",
];

/**
 * Read-only composition of a declared population (ADR-0011): a 100%-stacked
 * bar, one segment per walking-speed profile, sized by its share. Not an
 * editing control -- the only way to change the mix today is picking a
 * different named entry from `populationLibrary` in `EntranceParamGrid`'s own
 * dropdown, there is no per-share input to drag -- so unlike
 * `ArrivalProfileChart.tsx`/`OutageWindowTimeline.tsx` this needs no pointer
 * or keyboard handling.
 *
 * Not ECharts either, for the same reason the RiMEA status grid isn't: a
 * small fixed number of named segments with a native `title` tooltip needs no
 * axes, no interactive legend, no hover-over-a-data-point affordance.
 *
 * Before this there was nowhere in the editor to see what a population
 * actually contains -- only its name ("imo-ship-passengers") in a dropdown.
 * The legend below the bar is therefore new information, not a chart
 * alongside text that already existed.
 */
export function PopulationMixBar({
  mix,
  t,
}: {
  mix: PopulationMix;
  t: (key: TranslationKey) => string;
}) {
  const total = mix.reduce((sum, entry) => sum + entry.share, 0);
  if (total <= 0) return null;

  const segments = mix.map((entry, index) => {
    const preset = getPedestrianPreset(entry.profileId as PedestrianPresetId);
    return {
      color: segmentColors[index % segmentColors.length],
      label: preset?.label ?? entry.profileId,
      percent: (entry.share / total) * 100,
      profileId: entry.profileId,
    };
  });

  return (
    <div className="population-mix-bar">
      <div
        className="population-mix-track"
        role="img"
        aria-label={t("populationMixLabel")}
      >
        {segments.map((segment) => (
          <div
            key={segment.profileId}
            className="population-mix-segment"
            data-testid={`population-mix-segment-${segment.profileId}`}
            style={{ width: `${segment.percent}%`, backgroundColor: segment.color }}
            title={`${segment.label}: ${segment.percent.toFixed(0)}%`}
          />
        ))}
      </div>
      <ul className="population-mix-legend">
        {segments.map((segment) => (
          <li key={segment.profileId}>
            <span
              className="population-mix-swatch"
              style={{ backgroundColor: segment.color }}
            />
            {segment.label}: {segment.percent.toFixed(0)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
