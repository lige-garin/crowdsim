import { useEffect, useRef } from "react";
import { echarts, type EChartsOption } from "./echartsCore";

/**
 * The one place an ECharts instance gets created, resized and disposed in
 * this app. Every chart panel builds an `option` object (data + series +
 * axes) and hands it to this component -- it owns no chart-specific
 * knowledge itself.
 *
 * Feature-detects canvas 2D before ever calling `echarts.init`, because it
 * is genuinely unavailable in this project's own test environment (jsdom has
 * no `canvas` package installed -- the same reason `RealtimeStrip.tsx`
 * guards its own `getContext("2d")` call). This isn't a hypothetical: a
 * try/catch around `init`/`setOption` alone still let an uncaught exception
 * through, thrown asynchronously from zrender's own paint loop on the next
 * animation frame, well after this effect returned. Skipping `init`
 * entirely when there's no real 2D context avoids starting that loop at
 * all. A real browser always has canvas 2D, so this never no-ops outside
 * tests.
 */
export function EChart({
  ariaLabel,
  height = 160,
  option,
}: {
  ariaLabel: string;
  height?: number;
  option: EChartsOption;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Feature-detect canvas 2D *before* calling echarts.init: without a real
    // 2D context, zrender still starts its own requestAnimationFrame paint
    // loop and throws from inside that loop on the next frame, after this
    // effect (and any try/catch around init/setOption) has already returned
    // -- caught by trying it, not guessed.
    if (!document.createElement("canvas").getContext("2d")) return;

    const chart = echarts.init(container);
    chartRef.current = chart;

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => chart?.resize());
    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={containerRef}
      className="echart-container"
      role="img"
      aria-label={ariaLabel}
      style={{ height }}
    />
  );
}
