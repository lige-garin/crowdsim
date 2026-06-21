import { useState } from "react";
import { panelRegistry, type PanelDockContext } from "./panelRegistry";

export function PanelDock({
  language,
  context,
}: {
  language: "zh" | "en";
  context: PanelDockContext;
}) {
  // Collapsed by default: the dock is just a thin tab strip until the user opens
  // a panel, so it no longer fills the lower half of the screen with white.
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = panelRegistry.find((panel) => panel.id === activeId);

  return (
    <section
      className={`panel-dock${active ? "" : " panel-dock-collapsed"}`}
      aria-label={language === "zh" ? "工具面板" : "Tool panels"}
    >
      <nav
        aria-label={language === "zh" ? "面板导航" : "Panels"}
        className="panel-dock-nav"
      >
        <span className="panel-dock-hint">
          {language === "zh" ? "分析面板" : "Panels"}
        </span>
        {panelRegistry.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === activeId}
            onClick={() =>
              setActiveId((current) => (current === entry.id ? null : entry.id))
            }
          >
            {language === "zh" ? entry.labelZh : entry.labelEn}
          </button>
        ))}
      </nav>
      {active ? (
        <div className="panel-dock-body">{active.render(context)}</div>
      ) : null}
    </section>
  );
}
