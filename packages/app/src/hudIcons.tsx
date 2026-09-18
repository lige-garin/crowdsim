import type { ReactNode } from "react";

/**
 * The HUD's icon set.
 *
 * The permanent chrome carries no written labels — a city builder's rails are
 * icons, and the words are what made this shell read as a spreadsheet. Every
 * button still needs an accessible name, so each icon is `aria-hidden` and its
 * button supplies `aria-label` + `title`: no visible text, full screen-reader
 * and hover-tooltip behaviour.
 *
 * Drawn inline rather than pulled from an icon package: twenty glyphs do not
 * justify a dependency, and stroke geometry tuned to one grid keeps the rails
 * visually consistent.
 */
export type HudIconName =
  | "play"
  | "pause"
  | "reset"
  | "undo"
  | "cursor"
  | "road"
  | "building"
  | "zone"
  | "wall"
  | "shop"
  | "entrance"
  | "exit"
  | "transit"
  | "obstacle"
  | "hazard"
  | "countLine"
  | "service"
  | "crowd"
  | "heatmap"
  | "flow"
  | "risk"
  | "weather"
  | "network"
  | "curve"
  | "scatter"
  | "report"
  | "layers"
  | "scene"
  | "home"
  | "replay"
  | "close";

const PATHS: Record<HudIconName, ReactNode> = {
  play: <path d="M6 4l12 7-12 7z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect
        x="6"
        y="4"
        width="4"
        height="14"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="14"
        y="4"
        width="4"
        height="14"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  reset: (
    <>
      <path d="M4 11a7 7 0 1 1 2.1 5" />
      <path d="M3 20v-5h5" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  cursor: <path d="M5 3l7 17 2.4-6.6L21 11z" />,
  road: (
    <>
      <path d="M8 21L10 3" />
      <path d="M16 21L14 3" />
      <path d="M12 6v3M12 12v3M12 18v2" strokeDasharray="0" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V9l6-4 6 4v12" />
      <path d="M4 21h16" />
      <path d="M8 21v-5h4v5" />
      <path d="M16 21V12l4 2v7" />
    </>
  ),
  zone: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M12 3v18" strokeDasharray="2 3" />
    </>
  ),
  wall: (
    <>
      <rect x="3" y="6" width="18" height="5" rx="1" />
      <rect x="3" y="13" width="18" height="5" rx="1" />
      <path d="M9 6v5M15 13v5" />
    </>
  ),
  shop: (
    <>
      <path d="M4 9h16l-1 11H5z" />
      <path d="M3 9l2-4h14l2 4" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  entrance: (
    <>
      <path d="M14 3H6v18h8" />
      <path d="M10 12h11" />
      <path d="M18 8l3 4-3 4" />
    </>
  ),
  exit: (
    <>
      <path d="M10 3h8v18h-8" />
      <path d="M3 12h11" />
      <path d="M11 8l3 4-3 4" />
    </>
  ),
  transit: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 11h16" />
      <path d="M7 20v-4M17 20v-4" />
      <circle cx="8" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  obstacle: (
    <>
      <path d="M3 8h18v8H3z" />
      <path d="M5 16l4-8M11 16l4-8M17 16l4-8" />
    </>
  ),
  hazard: (
    <>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  countLine: (
    <>
      <path d="M4 4v16" strokeDasharray="3 3" />
      <path d="M9 12h10" />
      <path d="M16 8l3 4-3 4" />
    </>
  ),
  service: (
    <>
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <path d="M6 10V7a3 3 0 0 1 6 0v3" />
      <path d="M5 14v5M19 14v5" />
    </>
  ),
  crowd: (
    <>
      <circle cx="8" cy="8" r="2.4" />
      <circle cx="16" cy="9" r="2" />
      <path d="M3 20c0-3 2.4-5 5-5s5 2 5 5" />
      <path d="M13.5 20c.3-2.4 2-4 4-4 2 0 3.5 1.6 3.5 4" />
    </>
  ),
  heatmap: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" opacity="0.55" />
      <rect x="3" y="14" width="7" height="7" rx="1" opacity="0.55" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  flow: (
    <>
      <path d="M3 8c4 0 4 8 8 8s4-8 8-8" />
      <path d="M17 5l3 3-3 3" />
    </>
  ),
  risk: (
    <>
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="15.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  weather: (
    <>
      <path d="M7 16a4 4 0 0 1-.6-7.96A5 5 0 0 1 16 7a3.5 3.5 0 0 1 1 6.9" />
      <path d="M9 19l-1 2M13 19l-1 2M17 17l-1 2" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="8" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M7.8 7.2l2.6 8M16.4 9.6l-2.9 6.1M8.1 6.5l7.8 1.2" />
    </>
  ),
  curve: (
    <>
      <path d="M3 20V4" />
      <path d="M3 20h18" />
      <path d="M5 16c3 0 4-7 7-7s5 5 7 5" />
    </>
  ),
  scatter: (
    <>
      <path d="M3 20V4M3 20h18" />
      <circle cx="8" cy="15" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  scene: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l5-4 4 3 3-2 6 4" />
      <circle cx="9" cy="9" r="1.4" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 3v4h4" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" />
    </>
  ),
};

export function HudIcon({ name, size = 20 }: { name: HudIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="hud-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
