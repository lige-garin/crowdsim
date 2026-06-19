import { useState } from "react";
import { panelRegistry, type PanelDockContext } from "./panelRegistry";

export function PanelDock({
  language,
  context,
}: {
  language: "zh" | "en";
  context: PanelDockContext;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    panelRegistry[0]?.id ?? null,
  );
  const active =
    panelRegistry.find((panel) => panel.id === activeId) ?? panelRegistry[0];

  return (
    <section
      className="panel-dock"
      aria-label={language === "zh" ? "工具面板" : "Tool panels"}
    >
      <nav
        aria-label={language === "zh" ? "面板导航" : "Panels"}
        className="panel-dock-nav"
      >
        {panelRegistry.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === active?.id}
            onClick={() => setActiveId(entry.id)}
          >
            {language === "zh" ? entry.labelZh : entry.labelEn}
          </button>
        ))}
      </nav>
      <div className="panel-dock-body">
        {active ? active.render(context) : null}
      </div>
    </section>
  );
}
