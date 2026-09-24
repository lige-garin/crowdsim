import { useRef, useState } from "react";
import type { TranslationKey } from "./i18n";

const width = 260;
const paddingLeft = 4;
const paddingRight = 4;
const rowHeight = 26;
const barThickness = 14;
const topPadding = 6;
const bottomPadding = 6;
const step = 30;
const minGapSeconds = 30;
const plotWidth = width - paddingLeft - paddingRight;

type Handle = { index: number; edge: "start" | "end" };
type OutageWindow = { startsAtSeconds: number; endsAtSeconds: number };

/**
 * A Gantt-style timeline for a service point's outage windows: one row per
 * window, each with a draggable start handle and end handle. Same reasoning
 * as `ArrivalProfileChart.tsx` for going hand-rolled SVG instead of ECharts
 * (this is an editing control, not a passive chart) and for keeping the
 * plain-text field (`ServiceParamGrid`'s `outageWindows` `TextInput`)
 * alongside it rather than replacing it: this widget can only move/resize
 * windows that already exist in the text, not add or remove one -- exactly
 * the same division of labour `ArrivalProfileChart` has with the slot-count
 * `NumberInput` next to it.
 *
 * Height scales with the real number of windows (one row each), the same
 * "row count, not a fixed size" precedent `PlacesRankingChart.tsx` set for
 * lists that vary in length rather than spanning a fixed axis.
 *
 * Takes `t` as a plain prop, matching every other grid component in this
 * editor family (see `ArrivalProfileChart.tsx`'s doc comment for why).
 */
export function OutageWindowTimeline({
  onChange,
  t,
  windows,
}: {
  onChange: (windows: OutageWindow[]) => void;
  t: (key: TranslationKey) => string;
  windows: readonly OutageWindow[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<Handle | null>(null);
  const [liveWindows, setLiveWindows] = useState<readonly OutageWindow[] | null>(null);
  const shown = liveWindows ?? windows;
  const scaleMax = Math.max(600, ...shown.map((w) => w.endsAtSeconds)) * 1.2;
  const height = topPadding + shown.length * rowHeight + bottomPadding;

  function timeAtClientX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * width;
    const fraction = (relativeX - paddingLeft) / plotWidth;
    return Math.round((Math.max(0, Math.min(1, fraction)) * scaleMax) / step) * step;
  }

  function withHandleMoved(
    source: readonly OutageWindow[],
    handle: Handle,
    time: number,
  ): OutageWindow[] {
    const next = source.map((w) => ({ ...w }));
    const entry = next[handle.index];
    if (handle.edge === "start") {
      entry.startsAtSeconds = Math.max(
        0,
        Math.min(time, entry.endsAtSeconds - minGapSeconds),
      );
    } else {
      entry.endsAtSeconds = Math.max(entry.startsAtSeconds + minGapSeconds, time);
    }
    return next;
  }

  function startDrag(handle: Handle) {
    return (event: React.PointerEvent<SVGCircleElement>) => {
      dragging.current = handle;
      (event.target as Element).setPointerCapture(event.pointerId);
    };
  }

  function onDragMove(event: React.PointerEvent<SVGSVGElement>) {
    const handle = dragging.current;
    if (!handle) return;
    setLiveWindows(withHandleMoved(shown, handle, timeAtClientX(event.clientX)));
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = null;
    if (liveWindows) onChange([...liveWindows]);
    setLiveWindows(null);
  }

  function adjustByKeyboard(handle: Handle, delta: number) {
    const current =
      handle.edge === "start"
        ? windows[handle.index].startsAtSeconds
        : windows[handle.index].endsAtSeconds;
    onChange(withHandleMoved(windows, handle, current + delta));
  }

  return (
    <div className="outage-window-timeline">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("outageTimelineLabel")}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {shown.map((entry, index) => {
          const rowY = topPadding + index * rowHeight;
          const startX = paddingLeft + (entry.startsAtSeconds / scaleMax) * plotWidth;
          const endX = paddingLeft + (entry.endsAtSeconds / scaleMax) * plotWidth;
          const midY = rowY + barThickness / 2;
          return (
            <g key={index}>
              <rect
                className="outage-window-bar"
                x={startX}
                y={rowY}
                width={Math.max(1, endX - startX)}
                height={barThickness}
              />
              <text className="outage-window-label" x={startX} y={rowY - 2}>
                {`${entry.startsAtSeconds}s–${entry.endsAtSeconds}s`}
              </text>
              {(["start", "end"] as const).map((edge) => {
                const handle: Handle = { index, edge };
                const x = edge === "start" ? startX : endX;
                return (
                  <circle
                    key={edge}
                    className="outage-window-handle"
                    data-testid={`outage-window-${edge}-${index}`}
                    cx={x}
                    cy={midY}
                    r={5}
                    tabIndex={0}
                    role="slider"
                    aria-valuenow={
                      edge === "start" ? entry.startsAtSeconds : entry.endsAtSeconds
                    }
                    aria-valuemin={0}
                    aria-label={`${t("outageTimelineLabel")} ${index + 1}, ${t(
                      edge === "start"
                        ? "outageWindowStartLabel"
                        : "outageWindowEndLabel",
                    )}`}
                    onPointerDown={startDrag(handle)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowRight") {
                        event.preventDefault();
                        adjustByKeyboard(handle, step);
                      } else if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        adjustByKeyboard(handle, -step);
                      }
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
