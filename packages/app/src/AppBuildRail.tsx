import { useState, type CSSProperties } from "react";
import { buildCategories } from "./hudCatalog";
import { HudIcon } from "./hudIcons";
import type { Language } from "./i18n";
import type { EditorTool } from "./editor/sceneEditorState";

type AppBuildRailProps = {
  canUndo: boolean;
  editorTool: EditorTool;
  language: Language;
  onEditorToolChange: (tool: EditorTool) => void;
  onUndo: () => void;
};

/**
 * The main build toolbar, bottom centre — where a city builder keeps it.
 *
 * Docked: a row of large colour-coded category tiles, icons only. Open a
 * category and a tray of item cards rises above the bar. The tray carries
 * names because it is transient; the docked bar never does.
 *
 * It used to be a thin column of small grey icons down the left edge, which is
 * where an editor keeps its tools, not a game.
 */
export function AppBuildRail({
  canUndo,
  editorTool,
  language,
  onEditorToolChange,
  onUndo,
}: AppBuildRailProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const open = buildCategories.find((category) => category.id === openCategory);
  const selectLabel = language === "zh" ? "选择" : "Select";
  const undoLabel = language === "zh" ? "撤销建造" : "Undo build";

  return (
    <div className="hud-toolbar-wrap">
      {open ? (
        <div
          className="hud-panel hud-tray"
          data-testid={`build-flyout-${open.id}`}
          aria-label={open.label[language]}
          style={{ "--tile-color": open.color } as CSSProperties}
        >
          <header>{open.label[language]}</header>
          <div className="hud-tray-cards">
            {open.entries.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className="hud-card"
                data-testid={`palette-${entry.id}`}
                aria-pressed={editorTool === entry.tool}
                onClick={() => {
                  onEditorToolChange(entry.tool);
                  // The tray sits over the middle of the plan on a 720px-high
                  // window; leaving it open after a pick hides the very thing
                  // you are about to click.
                  setOpenCategory(null);
                }}
              >
                <span className="hud-card-art">
                  <HudIcon name={entry.icon} size={30} />
                </span>
                <span className="hud-card-name">{entry.label[language]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <nav
        className="hud-panel hud-toolbar"
        aria-label={language === "zh" ? "建造工具" : "Build tools"}
      >
        <button
          type="button"
          data-testid="palette-select"
          className="hud-tile hud-tile-neutral"
          aria-label={selectLabel}
          title={selectLabel}
          aria-pressed={editorTool === "select"}
          onClick={() => {
            setOpenCategory(null);
            onEditorToolChange("select");
          }}
        >
          <HudIcon name="cursor" size={24} />
        </button>

        <span className="hud-sep hud-sep-tall" aria-hidden="true" />

        <button
          type="button"
          data-testid="build-undo"
          className="hud-tile hud-tile-neutral"
          aria-label={undoLabel}
          // The shortcut is only bound where undo is live (the 3D run view).
          title={canUndo ? `${undoLabel} (Ctrl+Z)` : undoLabel}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <HudIcon name="undo" size={24} />
        </button>

        {buildCategories.map((category) => {
          const holdsActiveTool = category.entries.some(
            (entry) => entry.tool === editorTool,
          );
          return (
            <button
              type="button"
              key={category.id}
              data-testid={`build-category-${category.id}`}
              className="hud-tile"
              style={{ "--tile-color": category.color } as CSSProperties}
              aria-label={category.label[language]}
              title={category.label[language]}
              aria-expanded={openCategory === category.id}
              aria-pressed={holdsActiveTool}
              onClick={() =>
                setOpenCategory((current) =>
                  current === category.id ? null : category.id,
                )
              }
            >
              <HudIcon name={category.icon} size={26} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
