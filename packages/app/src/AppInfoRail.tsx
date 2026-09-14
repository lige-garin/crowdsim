import { infoLayers, infoWindows, type InfoWindowId } from "./hudCatalog";
import { HudIcon } from "./hudIcons";
import type { Language } from "./i18n";
import { viewportLayerText, type ViewportLayerId } from "./viewportLayers";
import type { ViewportLayers } from "./viewportLayers";

type AppInfoRailProps = {
  language: Language;
  layers: ViewportLayers;
  onToggleLayer: (layer: ViewportLayerId) => void;
  onToggleWindow: (id: InfoWindowId) => void;
  openWindows: readonly InfoWindowId[];
};

/**
 * The info rail: every readout in the app, collapsed to one column of icons.
 *
 * This replaces a 318px column that was permanently on screen showing seven
 * stacked panels of numbers whether or not anyone was reading them. Two kinds
 * of entry, deliberately distinguished by behaviour rather than by label: the
 * top group recolours the scene in place, the bottom group opens a floating
 * window. Nothing is on screen until it is asked for.
 */
export function AppInfoRail({
  language,
  layers,
  onToggleLayer,
  onToggleWindow,
  openWindows,
}: AppInfoRailProps) {
  return (
    <div className="hud-rail hud-rail-info">
      <nav
        className="hud-rail-buttons"
        aria-label={language === "zh" ? "信息视图" : "Info views"}
      >
        {infoLayers.map((entry) => {
          const name = viewportLayerText[entry.layer][language];
          return (
            <button
              type="button"
              key={entry.id}
              data-testid={`palette-${entry.id}`}
              className="hud-rail-button"
              aria-label={name}
              title={name}
              aria-pressed={layers[entry.layer]}
              onClick={() => onToggleLayer(entry.layer)}
            >
              <HudIcon name={entry.icon} />
            </button>
          );
        })}

        <span className="hud-rail-divider" aria-hidden="true" />

        {infoWindows.map((entry) => (
          <button
            type="button"
            key={entry.id}
            data-testid={`info-window-${entry.id}`}
            className="hud-rail-button"
            aria-label={entry.label[language]}
            title={entry.label[language]}
            aria-pressed={openWindows.includes(entry.id)}
            onClick={() => onToggleWindow(entry.id)}
          >
            <HudIcon name={entry.icon} />
          </button>
        ))}
      </nav>
    </div>
  );
}
