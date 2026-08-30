// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): this panel was titled "AI 描图" /
// "AI image tracing", but no part of it recognises an image. It runs the
// geometry cleanup pipeline over three hand-written fixtures and reports how
// many entries fell below the confidence threshold -- see the note in
// `AiImageOverlay.tsx` for where those confidence numbers come from. It is
// renamed and marked a demo so the pipeline is not mistaken for tracing that
// works on a user's own upload. Frozen 2026-08-30.
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
  const title = language === "zh" ? "图片描图（示例）" : "Image tracing (demo)";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "比例尺标定、几何清洗、低置信度复核和三样例验收已连通。"
          : "Scale calibration, geometry cleanup, low-confidence review, and three-fixture validation are connected."}
      </p>
      <code>
        fixtures {evaluation.fixtureCount} | low-confidence review {totalReviewCount}
      </code>
    </section>
  );
}
