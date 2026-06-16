import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { ChangeEvent, RefObject } from "react";
import {
  formatEditorTool,
  formatSceneName,
  type Language,
  type LocalizedText,
  type TranslationKey,
} from "./i18n";
import type { EditorTool } from "./sceneEditorState";

type DocumentCounts = {
  buildings: number;
  countLines: number;
  entrances: number;
  hazards: number;
  obstacles: number;
  roads: number;
  servicePoints: number;
  shops: number;
  targets: number;
  transitStops: number;
  walls: number;
  zones: number;
};

type SceneEditorControlsProps = {
  baseSceneId: string;
  basemapInputRef: RefObject<HTMLInputElement | null>;
  canDelete: boolean;
  canLoadSavedScene: boolean;
  canRedo: boolean;
  canUndo: boolean;
  documentCounts: DocumentCounts;
  fileInputRef: RefObject<HTMLInputElement | null>;
  geoJsonInputRef: RefObject<HTMLInputElement | null>;
  language: Language;
  onAiDraft: () => void;
  onBasemapImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onDeleteSelected: () => void;
  onExportScene: () => void;
  onGeoJsonImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportScene: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSavedScene: () => void;
  onRedo: () => void;
  onSaveScene: () => void;
  onSceneChange: (sceneId: string) => void;
  onToggleSnap: () => void;
  onToggleEditorViewMode: () => void;
  onToolChange: (tool: EditorTool) => void;
  onUndo: () => void;
  selectableScenes: readonly CrowdSimScene[];
  selectedLabel: string;
  snapEnabled: boolean;
  storageStatus: LocalizedText;
  t: (key: TranslationKey) => string;
  text: (value: LocalizedText) => string;
  tool: EditorTool;
  tools: readonly EditorTool[];
  viewMode: "isometric" | "topDown";
};

export function SceneEditorControls({
  baseSceneId,
  basemapInputRef,
  canDelete,
  canLoadSavedScene,
  canRedo,
  canUndo,
  documentCounts,
  fileInputRef,
  geoJsonInputRef,
  language,
  onAiDraft,
  onBasemapImport,
  onDeleteSelected,
  onExportScene,
  onGeoJsonImport,
  onImportScene,
  onLoadSavedScene,
  onRedo,
  onSaveScene,
  onSceneChange,
  onToggleSnap,
  onToggleEditorViewMode,
  onToolChange,
  onUndo,
  selectableScenes,
  selectedLabel,
  snapEnabled,
  storageStatus,
  t,
  text,
  tool,
  tools,
  viewMode,
}: SceneEditorControlsProps) {
  return (
    <>
      <div className="editor-filebar" aria-label={t("sceneFileControls")}>
        <label>
          <span>{t("scene")}</span>
          <select
            aria-label={t("exampleScene")}
            value={baseSceneId}
            onChange={(event) => onSceneChange(event.target.value)}
          >
            {selectableScenes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {formatSceneName(candidate, language)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onSaveScene}>
          {t("save")}
        </button>
        <button type="button" onClick={onLoadSavedScene} disabled={!canLoadSavedScene}>
          {t("loadSaved")}
        </button>
        <button type="button" onClick={onExportScene}>
          {t("export")}
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          {t("import")}
        </button>
        <button type="button" onClick={() => geoJsonInputRef.current?.click()}>
          {t("geoJsonImport")}
        </button>
        <button type="button" onClick={() => basemapInputRef.current?.click()}>
          {t("basemap")}
        </button>
        <button type="button" onClick={onAiDraft}>
          {t("aiDraft")}
        </button>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".csim.json,application/json"
          onChange={onImportScene}
        />
        <input
          ref={geoJsonInputRef}
          className="visually-hidden"
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={onGeoJsonImport}
        />
        <input
          ref={basemapInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={onBasemapImport}
        />
        <span>{text(storageStatus)}</span>
      </div>
      <div className="editor-toolbar" aria-label={t("editorTools")}>
        {tools.map((toolId) => (
          <button
            type="button"
            key={toolId}
            aria-pressed={tool === toolId}
            onClick={() => onToolChange(toolId)}
          >
            {formatEditorTool(toolId, language)}
          </button>
        ))}
        <button type="button" aria-pressed={snapEnabled} onClick={onToggleSnap}>
          {t("snap")}
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "isometric"}
          onClick={onToggleEditorViewMode}
        >
          {viewMode === "isometric" ? t("view2d5") : t("view2dPlan")}
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          {t("undo")}
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo}>
          {t("redo")}
        </button>
        <button type="button" onClick={onDeleteSelected} disabled={!canDelete}>
          {t("delete")}
        </button>
      </div>
      <div className="editor-status" aria-label={t("editorStatus")}>
        <span>
          {t("tool")} {formatEditorTool(tool, language)}
        </span>
        <span>
          {t("selected")} {selectedLabel}
        </span>
        <span>
          {t("roads")} {documentCounts.roads}
        </span>
        <span>
          {t("buildings")} {documentCounts.buildings}
        </span>
        <span>
          {t("walls")} {documentCounts.walls}
        </span>
        <span>
          {t("zones")} {documentCounts.zones}
        </span>
        <span>
          {t("entrances")} {documentCounts.entrances}
        </span>
        <span>
          {t("targets")} {documentCounts.targets}
        </span>
        <span>
          {t("shops")} {documentCounts.shops}
        </span>
        <span>
          {t("service")} {documentCounts.servicePoints}
        </span>
        <span>
          {t("transitStops")} {documentCounts.transitStops}
        </span>
        <span>
          {t("obstacles")} {documentCounts.obstacles}
        </span>
        <span>
          {t("hazards")} {documentCounts.hazards}
        </span>
        <span>
          {t("countLines")} {documentCounts.countLines}
        </span>
      </div>
    </>
  );
}
