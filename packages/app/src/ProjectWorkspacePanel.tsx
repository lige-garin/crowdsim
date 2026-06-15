import { useMemo } from "react";
import { useI18n } from "./i18n";
import { createDemoProjectWorkspace } from "./projectWorkspace";

export function ProjectWorkspacePanel() {
  const { language } = useI18n();
  const workspace = useMemo(() => createDemoProjectWorkspace(), []);
  const title = language === "zh" ? "项目工作台" : "Project workspace";
  const quotaLabel = workspace.quota.withinQuota ? "ok" : "blocked";
  const sessionLabel = workspace.authSession.active ? "active" : "expired";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "账号登录、云端场景、版本历史、只读分享和用量配额已串成产品化视图。"
          : "Login, cloud scenes, version history, read-only sharing, and quota are wired into one product view."}
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
