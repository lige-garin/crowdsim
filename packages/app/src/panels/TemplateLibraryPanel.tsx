import { industryTemplates } from "../scenes/industryTemplates";
import { useI18n } from "../i18n";

export function TemplateLibraryPanel() {
  const { language } = useI18n();
  const title = language === "zh" ? "行业模板库" : "Template library";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "6 个开箱即用行业模板，含推荐到达率、速度和规模参数。"
          : "Six ready-to-use industry templates with recommended demand, speed, and scale parameters."}
      </p>
      <div className="template-list">
        {industryTemplates.map((template) => (
          <article className="template-row" key={template.id}>
            <strong>{template.scene.name}</strong>
            <span>{template.description[language]}</span>
            <code>
              {template.recommended.arrivalRatePerMinute}/min |{" "}
              {template.recommended.speedMetersPerSecond}m/s | max{" "}
              {template.recommended.maxAgents}
            </code>
          </article>
        ))}
      </div>
    </section>
  );
}
