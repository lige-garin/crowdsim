import { useMemo } from "react";
import { createAiProxyRequest } from "./aiProxy";
import { createAiExperimentSuggestions } from "./aiExperimentSuggestion";
import { validateSceneAssistantResponses } from "./aiSceneAssistant";
import { parseNaturalLanguageEventScript } from "./eventScript";
import { useI18n } from "./i18n";
import { createValidationReport } from "./validationReport";

export function AiWorkflowPanel() {
  const { language } = useI18n();
  const workflow = useMemo(() => {
    const events = parseNaturalLanguageEventScript("18:05 西门突发关闭");
    const suggestions = createAiExperimentSuggestions(createValidationReport());
    const proxyRequest = createAiProxyRequest({
      payload: { prompt: "station evening peak" },
      provider: "anthropic",
      userId: "planner",
    });
    const sceneValidation = validateSceneAssistantResponses({
      prompt: "station evening peak",
      responses: [
        JSON.stringify({ id: "invalid-scene" }),
        JSON.stringify({
          schemaVersion: "1.0.0",
          id: "station-evening-peak",
          name: "Station Evening Peak",
          world: { width: 48, height: 28 },
        }),
      ],
    });

    return {
      eventCount: events.length,
      firstEventKind: events[0]?.kind ?? "none",
      proxyUrl: proxyRequest.url,
      schemaAttempts: sceneValidation.attempts.length,
      schemaStatus: sceneValidation.status,
      suggestionCount: suggestions.length,
    };
  }, []);
  const title = language === "zh" ? "AI 闭环" : "AI workflow";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "自然语言事件脚本与实验建议已连到同一条链路。"
          : "Natural-language event scripts and experiment suggestions share one pipeline."}
      </p>
      <code>
        {workflow.firstEventKind} | events {workflow.eventCount} | experiments{" "}
        {workflow.suggestionCount} | schema {workflow.schemaStatus}{" "}
        {workflow.schemaAttempts} | proxy {workflow.proxyUrl}
      </code>
    </section>
  );
}
