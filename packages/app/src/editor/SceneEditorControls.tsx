import { useEffect, useRef, useState } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import {
  formatEditorTool,
  formatSceneName,
  type Language,
  type LocalizedText,
  type TranslationKey,
} from "../i18n";
import type { EditorTool } from "./sceneEditorState";

const TOOL_GLYPH: Record<EditorTool, string> = {
  select: "SE",
  road: "RD",
  zone: "ZN",
  wall: "WL",
  building: "BL",
  source: "IN",
  sink: "EX",
  target: "TG",
  shop: "SH",
  transitStop: "BU",
  crosswalk: "CW",
  trafficSignal: "TS",
  counter: "CT",
  gate: "GT",
  obstacle: "OB",
  hazard: "HZ",
  countLine: "CL",
  connector: "ST",
};

type DocumentCounts = {
  buildings: number;
  countLines: number;
  crosswalks: number;
  entrances: number;
  hazards: number;
  obstacles: number;
  roads: number;
  servicePoints: number;
  shops: number;
  targets: number;
  trafficSignals: number;
  transitStops: number;
  walls: number;
  zones: number;
};

type SceneEditorControlsProps = {
  statusTrailing?: ReactNode;
  templatePrompt: string;
  baseSceneId: string;
  basemapInputRef: RefObject<HTMLInputElement | null>;
  canDelete: boolean;
  canLoadSavedScene: boolean;
  canRedo: boolean;
  canUndo: boolean;
  documentCounts: DocumentCounts;
  dxfInputRef: RefObject<HTMLInputElement | null>;
  ifcInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  geoJsonInputRef: RefObject<HTMLInputElement | null>;
  siteBundleInputRef: RefObject<HTMLInputElement | null>;
  language: Language;
  onTemplateDraft: () => void;
  onTemplatePromptChange: (value: string) => void;
  onApplyScene: () => void;
  onBasemapImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onDeleteSelected: () => void;
  onDxfImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onIfcImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportScene: () => void;
  onGeoJsonImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onSiteBundleImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportScene: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSavedScene: () => void;
  onRedo: () => void;
  onSaveScene: () => void;
  onSceneChange: (sceneId: string) => void;
  onShowTracingFixture: () => void;
  onToggleSnap: () => void;
  onToggleEditorViewMode: () => void;
  onToolChange: (tool: EditorTool) => void;
  onUndo: () => void;
  selectableScenes: readonly CrowdSimScene[];
  selectedLabel: string;
  snapEnabled: boolean;
  /** Caveats from the last site-bundle import, empty when there are none. */
  siteReport: readonly string[];
  storageStatus: LocalizedText;
  t: (key: TranslationKey) => string;
  text: (value: LocalizedText) => string;
  tool: EditorTool;
  tools: readonly EditorTool[];
  viewMode: "isometric" | "topDown";
};

export function SceneEditorControls({
  templatePrompt,
  baseSceneId,
  basemapInputRef,
  canDelete,
  canLoadSavedScene,
  canRedo,
  canUndo,
  documentCounts,
  dxfInputRef,
  ifcInputRef,
  fileInputRef,
  geoJsonInputRef,
  siteBundleInputRef,
  language,
  onTemplateDraft,
  onTemplatePromptChange,
  onApplyScene,
  onBasemapImport,
  onDeleteSelected,
  onDxfImport,
  onIfcImport,
  onExportScene,
  onGeoJsonImport,
  onSiteBundleImport,
  onImportScene,
  onLoadSavedScene,
  onRedo,
  onSaveScene,
  onSceneChange,
  onShowTracingFixture,
  onToggleSnap,
  onToggleEditorViewMode,
  onToolChange,
  onUndo,
  selectableScenes,
  selectedLabel,
  snapEnabled,
  siteReport,
  storageStatus,
  t,
  text,
  tool,
  tools,
  viewMode,
  statusTrailing,
}: SceneEditorControlsProps) {
  const [countsOpen, setCountsOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fileMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node)) setFileMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [fileMenuOpen]);
  const pick = (action: () => void) => () => {
    setFileMenuOpen(false);
    action();
  };
  const totalObjects = Object.values(documentCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
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
        <button
          type="button"
          className="editor-apply"
          data-testid="editor-apply-scene"
          onClick={onApplyScene}
        >
          {t("applyToSimulation")}
        </button>
        <div className="editor-file-menu-wrap" ref={fileMenuRef}>
          <button
            type="button"
            aria-expanded={fileMenuOpen}
            aria-haspopup="menu"
            onClick={() => setFileMenuOpen((open) => !open)}
          >
            {t("fileMenu")} {fileMenuOpen ? "▾" : "▸"}
          </button>
          {fileMenuOpen ? (
            <div
              className="editor-file-menu"
              role="menu"
              aria-label={t("fileMenu")}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFileMenuOpen(false);
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={pick(onLoadSavedScene)}
                disabled={!canLoadSavedScene}
              >
                {t("loadSaved")}
              </button>
              <button type="button" role="menuitem" onClick={pick(onExportScene)}>
                {t("export")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                {t("import")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  geoJsonInputRef.current?.click();
                }}
              >
                {t("geoJsonImport")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  siteBundleInputRef.current?.click();
                }}
              >
                {t("siteBundleImport")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  dxfInputRef.current?.click();
                }}
              >
                {t("dxfImport")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  ifcInputRef.current?.click();
                }}
              >
                {t("ifcImport")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  basemapInputRef.current?.click();
                }}
              >
                {t("basemap")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={pick(onShowTracingFixture)}
              >
                {t("imageTracingDemo")}
              </button>
              <div className="editor-file-menu-template">
                <input
                  aria-label={t("templatePrompt")}
                  type="text"
                  value={templatePrompt}
                  placeholder={t("templatePromptPlaceholder")}
                  onChange={(event) => onTemplatePromptChange(event.target.value)}
                />
                <button type="button" role="menuitem" onClick={pick(onTemplateDraft)}>
                  {t("templateDraft")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
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
          ref={siteBundleInputRef}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={onSiteBundleImport}
        />
        <input
          ref={dxfInputRef}
          className="visually-hidden"
          type="file"
          accept=".dxf,application/dxf,image/vnd.dxf"
          onChange={onDxfImport}
        />
        <input
          ref={ifcInputRef}
          className="visually-hidden"
          type="file"
          accept=".ifc,application/x-step,model/ifc"
          onChange={onIfcImport}
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
      {siteReport.length > 0 ? (
        <ul className="editor-site-report" data-testid="site-import-report">
          {siteReport.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="editor-toolbar" aria-label={t("editorTools")}>
        {tools.map((toolId) => (
          <button
            type="button"
            key={toolId}
            className="editor-tool"
            data-testid={`editor-tool-${toolId}`}
            aria-pressed={tool === toolId}
            onClick={() => onToolChange(toolId)}
          >
            <span className="editor-tool-glyph" aria-hidden="true">
              {TOOL_GLYPH[toolId]}
            </span>
            <span className="editor-tool-text">
              {formatEditorTool(toolId, language)}
            </span>
          </button>
        ))}
        <span className="editor-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="editor-tool"
          aria-pressed={snapEnabled}
          onClick={onToggleSnap}
        >
          <span className="editor-tool-glyph" aria-hidden="true">
            SN
          </span>
          <span className="editor-tool-text">{t("snap")}</span>
        </button>
        <button
          type="button"
          className="editor-tool"
          aria-pressed={viewMode === "isometric"}
          onClick={onToggleEditorViewMode}
        >
          <span className="editor-tool-glyph" aria-hidden="true">
            {viewMode === "isometric" ? "3D" : "2D"}
          </span>
          <span className="editor-tool-text">
            {viewMode === "isometric" ? t("view2d5") : t("view2dPlan")}
          </span>
        </button>
        <button
          type="button"
          className="editor-tool"
          data-testid="editor-undo"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <span className="editor-tool-glyph" aria-hidden="true">
            UN
          </span>
          <span className="editor-tool-text">{t("undo")}</span>
        </button>
        <button
          type="button"
          className="editor-tool"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <span className="editor-tool-glyph" aria-hidden="true">
            RE
          </span>
          <span className="editor-tool-text">{t("redo")}</span>
        </button>
        <button
          type="button"
          className="editor-tool"
          onClick={onDeleteSelected}
          disabled={!canDelete}
        >
          <span className="editor-tool-glyph" aria-hidden="true">
            DL
          </span>
          <span className="editor-tool-text">{t("delete")}</span>
        </button>
      </div>
      <div className="editor-status" aria-label={t("editorStatus")}>
        <span>
          {t("tool")} {formatEditorTool(tool, language)}
        </span>
        <span>
          {t("selected")} {selectedLabel}
        </span>
        <button
          type="button"
          className="editor-counts-toggle"
          aria-expanded={countsOpen}
          onClick={() => setCountsOpen((open) => !open)}
        >
          {t("objectCounts")} {totalObjects} {countsOpen ? "▾" : "▸"}
        </button>
        {countsOpen ? (
          <>
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
              {t("crosswalks")} {documentCounts.crosswalks}
            </span>
            <span>
              {t("trafficSignals")} {documentCounts.trafficSignals}
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
          </>
        ) : null}
        {statusTrailing}
      </div>
    </>
  );
}
