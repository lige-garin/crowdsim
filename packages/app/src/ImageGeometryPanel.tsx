import { useMemo } from "react";
import { evaluateImageTracingFixtures } from "./imageTracingEvaluation";
import { useI18n } from "./i18n";

export function ImageGeometryPanel() {
  const { language } = useI18n();
  const evaluation = useMemo(() => evaluateImageTracingFixtures(), []);
  const totalReviewCount = evaluation.results.reduce(
    (sum, result) => sum + result.lowConfidenceCount,
    0,
  );
  const title = language === "zh" ? "AI 描图" : "AI image tracing";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "比例尺标定、几何清洗、低置信度复核和三样例验收已连通。"
          : "Scale calibration, geometry cleanup, low-confidence review, and three-fixture validation are connected."}
      </p>
      <code>
        fixtures {evaluation.fixtureCount} | review {totalReviewCount} | reduction{" "}
        {Math.round(evaluation.averageReductionRatio * 100)}% |{" "}
        {evaluation.passedSeventyPercentTarget ? "70% pass" : "needs review"}
      </code>
    </section>
  );
}
