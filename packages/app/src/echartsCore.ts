import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

/**
 * The one place `echarts/core` gets configured for this app.
 *
 * Modular import, not the full `echarts` bundle: only the chart types and
 * components a panel in this UI actually uses are registered here (today:
 * bar charts, for the count-line/journey-time/places-ranking/sensitivity/
 * scenario-diff charts; mark lines, for the journey-time histogram's
 * P50/P90 markers; scatter, for the sensitivity panel's μ*-vs-σ plot;
 * boxplot, repurposed for the experiment-sweep panel's mean ± 95% CI error
 * bars). Add a new chart type to this list when a panel needs it, rather
 * than importing `echarts` directly elsewhere -- that would either
 * double-register or pull in the full ~1MB bundle.
 */
echarts.use([
  BarChart,
  BoxplotChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export { echarts };
export type EChartsOption = Parameters<ReturnType<typeof echarts.init>["setOption"]>[0];
