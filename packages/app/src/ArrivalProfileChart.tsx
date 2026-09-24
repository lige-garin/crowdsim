import { useRef, useState } from "react";
import type { TranslationKey } from "./i18n";

const width = 220;
const height = 90;
const barGap = 3;
const plotTop = 6;
const plotBottom = 78;
const plotHeight = plotBottom - plotTop;
const step = 5;

/**
 * The arrival-profile editor: each time slot's people-per-minute rate as a
 * draggable bar, rather than a comma-separated text field the user has to
 * type numbers into by hand. Hand-rolled SVG with pointer drag, not
 * ECharts -- this is an editing control, not a passive chart, which is
 * outside what a charting library is built for. The plain-text field stays
 * alongside it: dragging a bar to an exact value like "47" is fiddly,
 * typing it is not.
 *
 * Takes `t` as a plain `(key) => string` prop, matching every other grid
 * component in this editor (`SceneEditorFacilityParamGrids.tsx`), rather
 * than calling `useI18n()` directly -- that hook requires an `I18nProvider`
 * ancestor, which every existing test for this component tree deliberately
 * omits in favour of a trivial identity stub (`t: (key) => key`), decoupling
 * those tests from real translation strings. A first version of this
 * component called `useI18n()` and broke that; fixed by following the
 * convention instead of the hook.
 */
export function ArrivalProfileChart({
  intervalMinutes,
  onChange,
  rates,
  t,
}: {
  intervalMinutes: number;
  onChange: (rates: number[]) => void;
  rates: readonly number[];
  t: (key: TranslationKey) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingIndex = useRef<number | null>(null);
  const [liveRates, setLiveRates] = useState<readonly number[] | null>(null);
  const shown = liveRates ?? rates;
  const scaleMax = Math.max(60, ...shown) * 1.2;
  const barWidth = shown.length > 0 ? width / shown.length - barGap : 0;

  function valueAtClientY(clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const relativeY = ((clientY - rect.top) / rect.height) * height;
    const fraction = 1 - (relativeY - plotTop) / plotHeight;
    return Math.round((Math.max(0, Math.min(1, fraction)) * scaleMax) / step) * step;
  }

  function startDrag(index: number) {
    return (event: React.PointerEvent<SVGRectElement>) => {
      draggingIndex.current = index;
      (event.target as Element).setPointerCapture(event.pointerId);
    };
  }

  function onDragMove(event: React.PointerEvent<SVGSVGElement>) {
    const index = draggingIndex.current;
    if (index === null) return;
    const next = [...shown];
    next[index] = valueAtClientY(event.clientY);
    setLiveRates(next);
  }

  function endDrag() {
    if (draggingIndex.current === null) return;
    draggingIndex.current = null;
    if (liveRates) onChange([...liveRates]);
    setLiveRates(null);
  }

  function adjustByKeyboard(index: number, delta: number) {
    const next = [...rates];
    next[index] = Math.max(0, next[index] + delta);
    onChange(next);
  }

  return (
    <div className="arrival-profile-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("arrivalProfileChartLabel")}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {shown.map((rate, index) => {
          const barHeight = (rate / scaleMax) * plotHeight;
          const x = index * (barWidth + barGap);
          const y = plotBottom - barHeight;

          return (
            <g key={index}>
              <rect
                className="arrival-profile-bar"
                data-testid={`arrival-profile-bar-${index}`}
                x={x}
                y={y}
                width={Math.max(1, barWidth)}
                height={Math.max(0, barHeight)}
                tabIndex={0}
                role="slider"
                aria-valuenow={rate}
                aria-valuemin={0}
                aria-label={`${t("arrivalProfileSlotLabel")} ${index + 1}, ${t("arrivalProfileFromMinute")} ${index * intervalMinutes}`}
                onPointerDown={startDrag(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    adjustByKeyboard(index, step);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    adjustByKeyboard(index, -step);
                  }
                }}
              />
              <text x={x + barWidth / 2} y={plotBottom + 10}>
                {rate}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
