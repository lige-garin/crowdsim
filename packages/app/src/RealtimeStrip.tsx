import { useEffect, useRef } from "react";
import type { DashboardSample } from "./dashboardStats";

const copy = {
  en: { empty: "Waiting for the first sample…", present: "Present" },
  zh: { empty: "等待第一个采样点…", present: "在场" },
};

/** Matches `useRunSeries.ts`'s own `chartSeconds`: `dashboardSamples` never
 * holds more than this much history, so this is the real window, not a
 * cosmetic default. */
const windowSeconds = 120;

/**
 * The population strip: an ECG-monitor-style scrolling line of agent count
 * over the last two minutes, drawn straight from `dashboardSamples` (one
 * point per simulated second, already computed by `useRunSeries` -- this
 * draws it, it invents nothing).
 *
 * Canvas, not a chart library: this repaints every time a new sample lands,
 * which is at most once a wall-clock second (`useRunSeries`'s polling
 * interval), so a chart library's `setOption` call -- built for occasional
 * re-renders, not a per-second scrolling trace -- would be the wrong tool
 * here even though ECharts is already a dependency for the less frequent,
 * heavier chart types elsewhere in this UI pass.
 */
export function RealtimeStrip({
  language,
  samples,
}: {
  language: "en" | "zh";
  samples: readonly DashboardSample[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const text = copy[language];
  const latest = samples.at(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (samples.length < 2) return;

    const latestSeconds = samples[samples.length - 1].elapsedSeconds;
    const windowStart = latestSeconds - windowSeconds;
    const visible = samples.filter((sample) => sample.elapsedSeconds >= windowStart);
    if (visible.length < 2) return;

    const maxCount = Math.max(1, ...visible.map((sample) => sample.agentCount));
    const marginTop = 6;
    const marginBottom = 4;
    const plotHeight = Math.max(1, height - marginTop - marginBottom);
    const toX = (seconds: number) => ((seconds - windowStart) / windowSeconds) * width;
    const toY = (count: number) =>
      marginTop + plotHeight - (count / maxCount) * plotHeight;

    ctx.beginPath();
    ctx.moveTo(toX(visible[0].elapsedSeconds), height - marginBottom);
    for (const sample of visible) {
      ctx.lineTo(toX(sample.elapsedSeconds), toY(sample.agentCount));
    }
    ctx.lineTo(toX(visible[visible.length - 1].elapsedSeconds), height - marginBottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(47, 208, 255, 0.32)");
    gradient.addColorStop(1, "rgba(47, 208, 255, 0.02)");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    visible.forEach((sample, index) => {
      const x = toX(sample.elapsedSeconds);
      const y = toY(sample.agentCount);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#2fd0ff";
    ctx.lineWidth = 1.75;
    ctx.lineJoin = "round";
    ctx.stroke();

    const last = visible[visible.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.elapsedSeconds), toY(last.agentCount), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#2fd0ff";
    ctx.fill();
  }, [samples]);

  return (
    <div className="realtime-strip" data-testid="realtime-strip">
      <canvas ref={canvasRef} />
      <div className="realtime-strip-readout">
        <span>{text.present}</span>
        <strong>{latest ? latest.agentCount.toLocaleString() : text.empty}</strong>
      </div>
    </div>
  );
}
