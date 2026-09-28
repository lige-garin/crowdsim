// HONESTY NOTE (see docs/CLAIMS_LEDGER.md): this overlay is not the output of
// image recognition. There is no model and no pixel analysis anywhere in the
// pipeline. Every line and entrance is a hand-written constant in the demo
// fixtures (`imageTracingEvaluation.ts`), including the `confidence` values --
// 0.91, 0.88, 0.94 -- which are authored numbers, not anything measured or
// inferred. User-uploaded images are never traced: they land in the
// `not-traced` state and draw no geometry. The layer is therefore labelled a
// demo so the percentages are not misread as model output. Frozen 2026-08-30:
// do not call this "AI" in user-visible copy until real tracing exists.
import {
  findLowConfidenceGeometry,
  imagePointToScenePoint,
  type ImageGeometryDraft,
  type ImageScaleCalibration,
} from "./aiImageGeometry";
import { useI18n, type Language } from "../i18n";

type AiImageOverlayProps = {
  calibration: ImageScaleCalibration;
  draft: ImageGeometryDraft;
  reviewThreshold?: number;
};

const copy = {
  confidence: { zh: "置信度", en: "confidence" },
  layer: { zh: "描图图层（示例）", en: "Traced layer (demo)" },
  review: { zh: "复核", en: "review" },
};

export function AiImageOverlay({
  calibration,
  draft,
  reviewThreshold = 0.7,
}: AiImageOverlayProps) {
  const { language } = useI18n();
  const lowConfidenceIds = new Set(
    findLowConfidenceGeometry(draft, reviewThreshold).map((item) => item.id),
  );

  return (
    <g className="ai-image-overlay" role="group" aria-label={copy.layer[language]}>
      <text className="ai-image-overlay-title" x={1.6} y={3.2}>
        {copy.layer[language]}
      </text>
      {draft.lines.map((line) => {
        const [start, end] = line.points.map((point) =>
          imagePointToScenePoint(point, calibration),
        );
        const lowConfidence = lowConfidenceIds.has(line.id);
        const labelPoint = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        };

        return (
          <g
            key={line.id}
            className={lowConfidence ? "ai-image-item needs-review" : "ai-image-item"}
            data-ai-kind={line.kind}
            data-review={lowConfidence ? "required" : "accepted"}
          >
            <line
              className={`ai-image-line ai-image-line-${line.kind}`}
              x1={start.x}
              x2={end.x}
              y1={start.y}
              y2={end.y}
            />
            <text className="ai-image-label" x={labelPoint.x} y={labelPoint.y - 0.8}>
              {formatConfidence(line.confidence, language, lowConfidence)}
            </text>
          </g>
        );
      })}
      {(draft.entrances ?? []).map((entrance) => {
        const point = imagePointToScenePoint(entrance.position, calibration);
        const width = entrance.widthPixels * calibration.metersPerPixel;
        const lowConfidence = lowConfidenceIds.has(entrance.id);

        return (
          <g
            key={entrance.id}
            className={lowConfidence ? "ai-image-item needs-review" : "ai-image-item"}
            data-ai-kind={entrance.kind}
            data-review={lowConfidence ? "required" : "accepted"}
            transform={`translate(${point.x} ${point.y})`}
          >
            <rect
              className={`ai-image-entrance ai-image-entrance-${entrance.kind}`}
              x={-width / 2}
              y={-1.2}
              width={width}
              height={2.4}
            />
            <text className="ai-image-label" y={-1.9}>
              {formatConfidence(entrance.confidence, language, lowConfidence)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function formatConfidence(
  confidence: number,
  language: Language,
  lowConfidence: boolean,
) {
  const percent = Math.round(confidence * 100);
  const review = lowConfidence ? ` | ${copy.review[language]}` : "";

  return `${copy.confidence[language]} ${percent}%${review}`;
}
