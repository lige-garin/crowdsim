import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { formatSceneName, type Language } from "../i18n";
import { industryTemplates } from "../scenes/industryTemplates";
import { buildSceneThumbnail } from "../scenes/templateThumbnail";

/**
 * Step one of basic mode's four-step path (template → run → dashboard →
 * report): a clickable card per industry template, each with a schematic
 * floor-plan thumbnail (real scene geometry via `buildSceneThumbnail`, not a
 * placeholder image) and the three recommended numbers the template already
 * carried but had nowhere to show. Picking a card hands its real scene
 * straight to `onSelect`.
 *
 * `TemplateLibraryPanel.tsx` (the expert-mode "Tools" panel entry) stays as
 * it was -- an inert, informational list -- rather than being merged with
 * this. They serve different moments: that one is a reference list an expert
 * glances at inside a floating panel; this one is the entry point of the
 * whole basic-mode flow and has to actually load a scene. Sharing a
 * component for two different jobs would have meant threading an `onSelect`
 * callback through a panel that has never needed one.
 */
export function TemplateGallery({
  language,
  onSelect,
}: {
  language: Language;
  onSelect: (scene: CrowdSimScene) => void;
}) {
  return (
    <div className="template-gallery">
      {industryTemplates.map((template) => {
        const thumbnail = buildSceneThumbnail(template.scene);
        const name = formatSceneName(template.scene, language);

        return (
          <button
            key={template.id}
            type="button"
            className="template-card"
            data-testid={`template-card-${template.id}`}
            onClick={() => onSelect(template.scene)}
          >
            <svg
              className="template-card-thumbnail"
              viewBox={`0 0 ${thumbnail.viewBoxSize} ${thumbnail.viewBoxSize}`}
              role="img"
              aria-label={name}
            >
              {thumbnail.walls.map((wall, index) => (
                <line key={index} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
              ))}
              {thumbnail.buildings.map((building, index) => (
                <rect
                  key={index}
                  className="thumbnail-building"
                  x={building.x}
                  y={building.y}
                  width={building.width}
                  height={building.height}
                />
              ))}
              {thumbnail.shops.map((shop, index) => (
                <rect
                  key={index}
                  className="thumbnail-shop"
                  x={shop.x}
                  y={shop.y}
                  width={shop.width}
                  height={shop.height}
                />
              ))}
              {thumbnail.entrances.map((entrance, index) => (
                <circle key={index} cx={entrance.x} cy={entrance.y} r={1.5} />
              ))}
            </svg>
            <strong>{name}</strong>
            <span>{template.description[language]}</span>
            <div className="template-card-stats">
              <span>{template.recommended.arrivalRatePerMinute}/min</span>
              <span>{template.recommended.speedMetersPerSecond}m/s</span>
              <span>{`max ${template.recommended.maxAgents}`}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
