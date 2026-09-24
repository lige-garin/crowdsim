import * as echarts from "echarts/core";
import { BarChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

/**
 * The one place `echarts/core` gets configured for this app.
 *
 * Modular import, not the full `echarts` bundle: only the chart types and
 * components a panel in this UI actually uses are registered here (today:
 * bar charts, for the count-line/journey-time/places-ranking/sensitivity
 * charts; mark lines, for the journey-time histogram's P50/P90 markers;
 * scatter, for the sensitivity panel's μ*-vs-σ plot). Add a new chart type
 * to this list when a panel needs it, rather than importing `echarts`
 * directly elsewhere -- that would either double-register or pull in the
 * full ~1MB bundle.
 */
echarts.use([
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export { echarts };
export type EChartsOption = Parameters<ReturnType<typeof echarts.init>["setOption"]>[0];
