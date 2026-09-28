import { BrandAttractionGraph } from "../charts/BrandAttractionGraph";
import type { BrandDecisionInsight } from "../brandDecisionProbe";
import { useI18n, type LocalizedText } from "../i18n";

const copy = {
  empty: {
    zh: "等待品牌吸引力探针",
    en: "Waiting for brand attraction probe",
  },
  intent: { zh: "意图", en: "Intent" },
  persona: { zh: "人格", en: "Persona" },
  pull: { zh: "品牌吸引", en: "Brand pull" },
  field: { zh: "品牌吸引场", en: "Brand attraction field" },
  title: { zh: "品牌智能体", en: "Brand intelligence" },
  twin: { zh: "顾客孪生", en: "Customer twin" },
  why: { zh: "选择解释", en: "Choice explanation" },
} satisfies Record<string, LocalizedText>;

export function BrandIntelligencePanel({
  insight,
}: {
  insight?: BrandDecisionInsight;
}) {
  const { text } = useI18n();

  return (
    <section className="brand-intelligence-panel" aria-label={text(copy.title)}>
      <div>
        <p className="eyebrow">{text(copy.pull)}</p>
        <h2>{text(copy.title)}</h2>
      </div>
      {insight ? (
        <>
          <div className="brand-agent-strip">
            <Metric label={text(copy.persona)} value={insight.persona} />
            <Metric label={text(copy.intent)} value={insight.currentIntent} />
            <Metric
              label={text(copy.twin)}
              value={`${insight.twin.inferredPersona} / ${insight.twin.observations}`}
            />
          </div>
          <article className="brand-choice-card">
            <span>{insight.selectedCategory}</span>
            <strong>{insight.selectedBrandName}</strong>
            <code>
              {insight.probabilityPercent}% | score {insight.score} | MAE{" "}
              {insight.calibration.meanAbsoluteErrorBefore}
              {" -> "}
              {insight.calibration.meanAbsoluteErrorAfter}
            </code>
          </article>
          <BrandAttractionGraph insight={insight} label={text(copy.field)} />
          <div className="brand-rank-list">
            {insight.topStores.map((store) => (
              <article key={store.id}>
                <span>{store.category}</span>
                <strong>{store.name}</strong>
                <meter min="0" max="100" value={store.probabilityPercent} />
                <code>
                  {store.probabilityPercent}% / {store.score}
                </code>
              </article>
            ))}
          </div>
          <div className="brand-reasons" aria-label={text(copy.why)}>
            {insight.reasons.map((reason) => (
              <code key={reason}>{reason}</code>
            ))}
          </div>
          <code className="dashboard-summary">{insight.twin.categoryAffinity}</code>
        </>
      ) : (
        <code className="dashboard-summary">{text(copy.empty)}</code>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
