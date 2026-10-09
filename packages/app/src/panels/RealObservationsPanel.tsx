import { useRef, useState, type ChangeEvent } from "react";
import type { Language } from "../i18n";
import {
  compareLineCounts,
  comparePosReceipts,
  parseLineCountObservationsCsv,
  parseReceiptTimestampsCsv,
  summarizeLineCountComparison,
  type LineCountComparisonRow,
  type ObservedLineCount,
  type ObservedReceipt,
  type PosComparisonRow,
} from "../analytics/realObservations";
import type { MinuteFlow, RunAnalyticsSummary } from "../analytics/runAnalytics";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  applyArrivalCalibration,
  calibrateArrivals,
  describeArrivalCalibration,
} from "../analytics/arrivalCalibration";

const copy = {
  en: {
    backward: "←",
    error: "Could not read that file",
    forward: "→",
    importLines: "Import line counts (CSV)",
    importReceipts: "Import receipts (CSV)",
    applyArrivals: "Apply measured arrivals to matching entrances",
    intro:
      "Compares uploaded counts with this run. Gate rows matching an entrance id or name can also replace that entrance's arrival profile; this is a measured input update, not live data assimilation.",
    lineCountsEmpty: "No line-count file imported yet.",
    mae: "Mean absolute error",
    matched: "matched minutes",
    observed: "observed",
    observedOnly: "observed-only minutes",
    receiptsEmpty: "No receipt file imported yet.",
    simulated: "simulated",
    simulatedOnly: "simulated-only minutes",
    title: "Real observations",
    total: "totals",
  },
  zh: {
    backward: "←",
    error: "无法读取该文件",
    forward: "→",
    importLines: "导入计数线数据（CSV）",
    importReceipts: "导入 POS 小票数据（CSV）",
    applyArrivals: "把实测到达率应用到同名入口",
    intro:
      "把上传的真实计数与本次运行结果直接比较；与入口 ID 或名称相同的闸机数据还能写成入口到达曲线。这是实测输入更新，不是数据同化或实时纠偏。",
    lineCountsEmpty: "尚未导入计数线数据。",
    mae: "平均绝对误差",
    matched: "匹配分钟数",
    observed: "实测（真实）",
    observedOnly: "仅有真实数据的分钟",
    receiptsEmpty: "尚未导入小票数据。",
    simulated: "仿真",
    simulatedOnly: "仅有仿真数据的分钟",
    title: "真实观测数据",
    total: "合计",
  },
};

/**
 * Batch 4.2 of the gap-closure plan: real turnstile/camera line counts and
 * POS receipt timestamps, imported as CSV and compared against this run's
 * own `runAnalytics` output. This is the plain count-by-count comparison the
 * plan itself names as the *prerequisite* for real data assimilation
 * (particle filter / EnKF) -- it does not feed anything back into the
 * running simulation, and recomputes from whatever has been measured so far
 * each time it renders, not a fixed snapshot from the moment of import.
 */
export function RealObservationsPanel({
  language,
  minuteFlows,
  places,
  scene,
  onApplyScene,
}: {
  language: Language;
  minuteFlows: () => MinuteFlow[];
  places: RunAnalyticsSummary["places"];
  scene: CrowdSimScene;
  onApplyScene?: (scene: CrowdSimScene) => void;
}) {
  const text = copy[language];
  const [lineCounts, setLineCounts] = useState<ObservedLineCount[] | null>(null);
  const [receipts, setReceipts] = useState<ObservedReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lineInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  async function importLineCounts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLineCounts(parseLineCountObservationsCsv(await file.text()));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.error);
    } finally {
      event.target.value = "";
    }
  }

  async function importReceipts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setReceipts(parseReceiptTimestampsCsv(await file.text()));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.error);
    } finally {
      event.target.value = "";
    }
  }

  const lineComparison: LineCountComparisonRow[] | null = lineCounts
    ? compareLineCounts(lineCounts, minuteFlows())
    : null;
  const lineSummary = lineComparison
    ? summarizeLineCountComparison(lineComparison)
    : null;
  const receiptComparison: PosComparisonRow[] | null = receipts
    ? comparePosReceipts(receipts, places)
    : null;
  const calibration = lineCounts ? calibrateArrivals(scene, lineCounts) : null;

  return (
    <section className="compact-panel real-observations" aria-label={text.title}>
      <header>
        <span>{text.title}</span>
      </header>
      <p className="run-analytics-single-run">{text.intro}</p>

      <div className="real-observations-imports">
        <input
          ref={lineInputRef}
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          onChange={importLineCounts}
          data-testid="import-line-counts-input"
        />
        <button type="button" onClick={() => lineInputRef.current?.click()}>
          {text.importLines}
        </button>
        <input
          ref={receiptInputRef}
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          onChange={importReceipts}
          data-testid="import-receipts-input"
        />
        <button type="button" onClick={() => receiptInputRef.current?.click()}>
          {text.importReceipts}
        </button>
      </div>

      {error ? (
        <p className="run-analytics-empty" role="alert">
          {error}
        </p>
      ) : null}

      {lineSummary ? (
        <>
          <div className="status-list" data-testid="line-count-summary">
            <div>
              <span>{text.matched}</span>
              <strong>{lineSummary.matchedMinutes}</strong>
            </div>
            <div>
              <span>{text.mae}</span>
              <strong>{lineSummary.meanAbsoluteError.toFixed(2)}</strong>
            </div>
            <div>
              <span>{text.total}</span>
              <strong>
                {text.observed} {lineSummary.totalObserved} · {text.simulated}{" "}
                {lineSummary.totalSimulated}
              </strong>
            </div>
            <div>
              <span>
                {text.observedOnly} / {text.simulatedOnly}
              </span>
              <strong>
                {lineSummary.observedOnlyMinutes} / {lineSummary.simulatedOnlyMinutes}
              </strong>
            </div>
          </div>
          {calibration ? (
            <div className="arrival-calibration" data-testid="arrival-calibration">
              {describeArrivalCalibration(calibration).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <button
                type="button"
                disabled={
                  !onApplyScene ||
                  calibration.doors.every((door) => door.status === "no-data")
                }
                onClick={() =>
                  onApplyScene?.(applyArrivalCalibration(scene, calibration))
                }
              >
                {text.applyArrivals}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="run-analytics-empty">{text.lineCountsEmpty}</p>
      )}

      {receiptComparison ? (
        <div className="status-list" data-testid="receipt-comparison">
          {receiptComparison.map((row) => (
            <div key={row.placeId}>
              <span>{row.placeId}</span>
              <strong>
                {text.observed} {row.observedTransactions} · {text.simulated}{" "}
                {row.simulatedServiceVisits ?? "–"}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="run-analytics-empty">{text.receiptsEmpty}</p>
      )}
    </section>
  );
}
