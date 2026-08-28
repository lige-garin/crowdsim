import { InMemoryProjectStore } from "@crowdsim/collab";
import { useMemo } from "react";
import { demoScene } from "./demoScene";
import { useI18n } from "./i18n";

export function CollaborationStatusPanel() {
  const { language } = useI18n();
  const status = useMemo(() => {
    // Fixed demo token: the store now mints share tokens itself.
    const store = new InMemoryProjectStore({
      createShareToken: () => "demo-read-only",
    });
    const project = store.createProject({
      id: "demo-project",
      name: "Demo Project",
      ownerId: "planner",
      scene: demoScene,
      timestampIso: "2026-06-12T00:00:00.000Z",
    });
    store.appendEvent({
      actorId: "doctor-1",
      atIso: "2026-06-12T00:01:00.000Z",
      kind: "presence",
      projectId: project.id,
      selectionId: "main-entry",
    });
    store.createReadOnlyShareLink({
      actorId: "planner",
      projectId: project.id,
      timestampIso: "2026-06-12T00:02:00.000Z",
    });
    store.recordUsage("planner", "experiment-runs", 4);

    return {
      snapshot: store.snapshot(),
      usage: store.getUsageSnapshot("planner"),
    };
  }, []);
  const title = language === "zh" ? "协作后端" : "Collaboration backend";
  const summary =
    language === "zh"
      ? "项目版本、协作事件和审计日志已具备本地演示适配与 Cloudflare D1/R2 合同。"
      : "Project versions, collaboration events, and audit logs have local demo storage plus Cloudflare D1/R2 contracts.";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{summary}</p>
      <code>
        projects {status.snapshot.projects.length} | events{" "}
        {status.snapshot.events.length} | audit {status.snapshot.auditLog.length} |
        share {status.snapshot.shareLinks.length} | quota{" "}
        {status.usage.withinQuota ? "ok" : "blocked"}
      </code>
    </section>
  );
}
