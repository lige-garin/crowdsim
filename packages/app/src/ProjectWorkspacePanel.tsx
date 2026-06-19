import { useEffect, useMemo, useState } from "react";
import type { ProjectRecord } from "@crowdsim/collab";
import type { BackendClient } from "./backendClient";
import { useI18n } from "./i18n";
import { createDemoProjectWorkspace } from "./projectWorkspace";

const DEMO_OWNER = "demo-owner";

export function ProjectWorkspacePanel({ client }: { client?: BackendClient }) {
  const { language } = useI18n();
  const title = language === "zh" ? "项目工作台" : "Project workspace";

  if (client) {
    return <LiveWorkspace client={client} title={title} language={language} />;
  }
  return <DemoWorkspace title={title} language={language} />;
}

function LiveWorkspace({
  client,
  title,
  language,
}: {
  client: BackendClient;
  title: string;
  language: "zh" | "en";
}) {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    client
      .listProjects(DEMO_OWNER)
      .then((list) => {
        if (active) setProjects(list);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>{language === "zh" ? "实时后端 · 项目列表" : "Live backend · project list"}</p>
      {error ? (
        <code>{error}</code>
      ) : projects === null ? (
        <p>{language === "zh" ? "加载中…" : "Loading…"}</p>
      ) : projects.length === 0 ? (
        <p>{language === "zh" ? "暂无项目" : "No projects yet"}</p>
      ) : (
        <div className="workspace-list">
          {projects.map((project) => (
            <div className="workspace-row" key={project.id}>
              <span>{project.name}</span>
              <strong>v{project.version}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DemoWorkspace({
  title,
  language,
}: {
  title: string;
  language: "zh" | "en";
}) {
  const workspace = useMemo(() => createDemoProjectWorkspace(), []);
  const quotaLabel = workspace.quota.withinQuota ? "ok" : "blocked";
  const sessionLabel = workspace.authSession.active ? "active" : "expired";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p className="eyebrow">
        {language === "zh"
          ? "样例数据 · 未接实时后端"
          : "Sample data · no live backend"}
      </p>
      <p>
        {language === "zh"
          ? "账号登录、云端场景、版本历史、只读分享和用量配额的产品化视图（示例）。"
          : "Product view of login, cloud scenes, version history, sharing and quota (sample)."}
      </p>
      <div className="workspace-list">
        <div className="workspace-row">
          <span>{language === "zh" ? "账号" : "Account"}</span>
          <strong>{workspace.accountName}</strong>
        </div>
        <div className="workspace-row">
          <span>{language === "zh" ? "会话" : "Session"}</span>
          <strong>
            {sessionLabel} | {workspace.authSession.tokenPreview}
          </strong>
        </div>
        <div className="workspace-row">
          <span>{language === "zh" ? "项目" : "Project"}</span>
          <strong>{workspace.projectName}</strong>
        </div>
        <div className="workspace-row">
          <span>{language === "zh" ? "版本" : "Versions"}</span>
          <strong>
            v{workspace.currentVersion} / {workspace.versionCount}
          </strong>
        </div>
        <div className="workspace-row">
          <span>{language === "zh" ? "分享" : "Share"}</span>
          <strong>{workspace.shareUrl}</strong>
        </div>
        <div className="workspace-row">
          <span>API</span>
          <strong>{workspace.backend.apiRoutes.join(" | ")}</strong>
        </div>
      </div>
      <code>
        {workspace.backend.label} | {workspace.backend.relationalStore} | quota{" "}
        {quotaLabel} | session {sessionLabel}
      </code>
    </section>
  );
}
