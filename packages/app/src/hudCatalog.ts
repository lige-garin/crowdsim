import type { HudIconName } from "./hudIcons";
import type { EditorTool } from "./sceneEditorState";
import type { ViewportLayerId } from "./viewportLayers";

export type LocalizedLabel = { en: string; zh: string };

/**
 * What the build rail can put in a flyout.
 *
 * `tool` covers everything the scene editor can draw today. The variant list
 * is deliberately open: an asset library (industrial / commercial / civic /
 * indoor / outdoor props) is a new `kind` and a new category here, not a new
 * shell — the rail renders whatever the catalog declares.
 */
export type BuildEntry = {
  icon: HudIconName;
  id: string;
  label: LocalizedLabel;
  tool: EditorTool;
};

export type BuildCategory = {
  /** Tile colour on the toolbar, the way a city builder colour-codes tool families. */
  color: string;
  entries: readonly BuildEntry[];
  icon: HudIconName;
  id: string;
  label: LocalizedLabel;
};

/**
 * The build rail: icons only while docked, names only once a flyout is open.
 *
 * The rail this replaces was a 238px column of four titled sections and
 * sixteen two-line buttons, permanently on screen next to a second, different
 * palette of twenty-one two-letter buttons above the canvas. Same tools, twice,
 * both always visible, together eating a third of the window.
 */
export const buildCategories: readonly BuildCategory[] = [
  {
    id: "structure",
    color: "#e8913a",
    icon: "building",
    label: { en: "Structure", zh: "建造" },
    entries: [
      {
        icon: "road",
        id: "road",
        label: { en: "Road", zh: "道路" },
        tool: "road",
      },
      {
        icon: "building",
        id: "building",
        label: { en: "Building", zh: "建筑" },
        tool: "building",
      },
      {
        icon: "zone",
        id: "zone",
        label: { en: "District", zh: "区域" },
        tool: "zone",
      },
      {
        icon: "wall",
        id: "wall",
        label: { en: "Wall", zh: "墙体" },
        tool: "wall",
      },
    ],
  },
  {
    id: "commerce",
    color: "#3b9be8",
    icon: "shop",
    label: { en: "Commerce", zh: "商业" },
    entries: [
      {
        icon: "shop",
        id: "shop",
        label: { en: "Store", zh: "商铺" },
        tool: "shop",
      },
      {
        icon: "service",
        id: "counter",
        label: { en: "Service point", zh: "服务点" },
        tool: "counter",
      },
    ],
  },
  {
    id: "flow",
    color: "#2fb8a6",
    icon: "transit",
    label: { en: "Flow", zh: "人流" },
    entries: [
      {
        icon: "entrance",
        id: "source",
        label: { en: "Entrance", zh: "入口" },
        tool: "source",
      },
      {
        icon: "exit",
        id: "sink",
        label: { en: "Exit", zh: "出口" },
        tool: "sink",
      },
      {
        icon: "transit",
        id: "transitStop",
        label: { en: "Transit stop", zh: "公交站" },
        tool: "transitStop",
      },
      {
        icon: "countLine",
        id: "countLine",
        label: { en: "Count line", zh: "计数线" },
        tool: "countLine",
      },
    ],
  },
  {
    id: "disruption",
    color: "#e05a4f",
    icon: "hazard",
    label: { en: "Disruption", zh: "扰动" },
    entries: [
      {
        icon: "obstacle",
        id: "obstacle",
        label: { en: "Obstacle", zh: "障碍" },
        tool: "obstacle",
      },
      {
        icon: "hazard",
        id: "hazard",
        label: { en: "Hazard", zh: "灾害" },
        tool: "hazard",
      },
    ],
  },
];

/**
 * Info views split in two, because they behave differently and conflating them
 * is what produced a rail of numbers nobody read.
 *
 * A `layer` recolours the scene itself and toggles in place — that is the whole
 * interaction, no panel involved. A `window` opens a floating panel because it
 * is a chart, and a chart cannot be drawn onto the ground.
 */
export type InfoLayerEntry = {
  icon: HudIconName;
  id: string;
  layer: ViewportLayerId;
};

export type InfoWindowEntry = {
  icon: HudIconName;
  id: InfoWindowId;
  label: LocalizedLabel;
};

export type InfoWindowId = "analytics" | "tools";

export const infoLayers: readonly InfoLayerEntry[] = [
  {
    icon: "crowd",
    id: "layer-crowd",
    layer: "crowd",
  },
  {
    icon: "scatter",
    id: "layer-behaviour",
    layer: "behaviour",
  },
  {
    icon: "heatmap",
    id: "layer-heatmap",
    layer: "heatmap",
  },
  {
    icon: "flow",
    id: "layer-flow",
    layer: "flow",
  },
  {
    icon: "risk",
    id: "layer-risk",
    layer: "risk",
  },
];

export const infoWindows: readonly InfoWindowEntry[] = [
  {
    icon: "curve",
    id: "analytics",
    label: { en: "Live analytics", zh: "实时分析" },
  },
  {
    icon: "report",
    id: "tools",
    label: { en: "Tools & experiments", zh: "工具与实验" },
  },
];

/*
 * Deliberately NOT listed yet: contact-network, movement-line and
 * speed-vs-density windows. Their charts are the next piece of work, and a rail
 * icon that opens an empty panel is exactly the decorative control this shell
 * has been stripped of twice already. They join the rail when they draw
 * something.
 */
