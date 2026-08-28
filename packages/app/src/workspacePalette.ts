import type { EditorTool } from "./sceneEditorState";
import type { ViewportLayerId } from "./viewportLayers";

export type LocalizedLabel = { en: string; zh: string };

/**
 * The shell's left-hand palette.
 *
 * It replaces a 16-button "city planning tools" grid whose every `onClick` did
 * nothing but set its own highlight: no consumer read the state, so the buttons
 * lit up and the app never changed. Six of those labels (Terrain, Sight, Wind,
 * Parking, Landscape, Lighting) had no implementation anywhere in the repo and
 * are gone rather than re-faked.
 *
 * Every entry below resolves to something that exists: either a scene-editor
 * tool from `editorTools`, or a viewport layer from `viewportLayerIds`. The
 * accompanying test asserts exactly that, so a future entry cannot quietly
 * become decorative again.
 */
export type PaletteEntry =
  | {
      glyph: string;
      id: string;
      kind: "editor";
      label: LocalizedLabel;
      tool: EditorTool;
    }
  | {
      glyph: string;
      id: string;
      kind: "layer";
      label: LocalizedLabel;
      layer: ViewportLayerId;
    };

export type PaletteGroup = {
  entries: readonly PaletteEntry[];
  title: LocalizedLabel;
};

export const workspacePaletteGroups: readonly PaletteGroup[] = [
  {
    title: { en: "Draw", zh: "绘制" },
    entries: [
      {
        glyph: "RD",
        id: "road",
        kind: "editor",
        label: { en: "Roads", zh: "道路" },
        tool: "road",
      },
      {
        glyph: "BL",
        id: "building",
        kind: "editor",
        label: { en: "Buildings", zh: "建筑" },
        tool: "building",
      },
      {
        glyph: "ZN",
        id: "zone",
        kind: "editor",
        label: { en: "Districts", zh: "区域" },
        tool: "zone",
      },
      {
        glyph: "WL",
        id: "wall",
        kind: "editor",
        label: { en: "Walls", zh: "墙体" },
        tool: "wall",
      },
    ],
  },
  {
    title: { en: "People & transit", zh: "人流与交通" },
    entries: [
      {
        glyph: "SH",
        id: "shop",
        kind: "editor",
        label: { en: "Stores", zh: "商铺" },
        tool: "shop",
      },
      {
        glyph: "IN",
        id: "source",
        kind: "editor",
        label: { en: "Entrances", zh: "入口" },
        tool: "source",
      },
      {
        glyph: "EX",
        id: "sink",
        kind: "editor",
        label: { en: "Exits", zh: "出口" },
        tool: "sink",
      },
      {
        glyph: "BU",
        id: "transitStop",
        kind: "editor",
        label: { en: "Transit", zh: "公交" },
        tool: "transitStop",
      },
    ],
  },
  {
    title: { en: "Constraints", zh: "约束与扰动" },
    entries: [
      {
        glyph: "OB",
        id: "obstacle",
        kind: "editor",
        label: { en: "Obstacles", zh: "障碍" },
        tool: "obstacle",
      },
      {
        glyph: "HZ",
        id: "hazard",
        kind: "editor",
        label: { en: "Hazards", zh: "灾害" },
        tool: "hazard",
      },
      {
        glyph: "CL",
        id: "countLine",
        kind: "editor",
        label: { en: "Count lines", zh: "计数线" },
        tool: "countLine",
      },
      {
        glyph: "SV",
        id: "counter",
        kind: "editor",
        label: { en: "Service", zh: "服务点" },
        tool: "counter",
      },
    ],
  },
  {
    title: { en: "Layers", zh: "图层" },
    entries: [
      {
        glyph: "AG",
        id: "layer-crowd",
        kind: "layer",
        label: { en: "Crowd", zh: "人群" },
        layer: "crowd",
      },
      {
        glyph: "HM",
        id: "layer-heatmap",
        kind: "layer",
        label: { en: "Heatmap", zh: "热力" },
        layer: "heatmap",
      },
      {
        glyph: "FL",
        id: "layer-flow",
        kind: "layer",
        label: { en: "Flow", zh: "流线" },
        layer: "flow",
      },
      {
        glyph: "R!",
        id: "layer-risk",
        kind: "layer",
        label: { en: "Risk", zh: "风险" },
        layer: "risk",
      },
    ],
  },
];

export function workspacePaletteEntries(): readonly PaletteEntry[] {
  return workspacePaletteGroups.flatMap((group) => group.entries);
}
