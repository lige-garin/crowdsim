import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelDock } from "./PanelDock";
import { panelRegistry } from "./panelRegistry";
import type { PanelDockContext } from "./panelRegistry";

const ctx = {
  trajectoryRecording: {
    id: "t",
    runtime: {} as never,
    sceneId: "s",
    seed: 1,
    frames: [],
  },
} as unknown as PanelDockContext;

describe("PanelDock", () => {
  it("renders a panels navigation region", () => {
    render(<PanelDock language="en" context={ctx} />);
    expect(
      screen.getByRole("navigation", { name: /panels/i }),
    ).toBeInTheDocument();
  });

  it("renders exactly one nav button per registered panel", () => {
    render(<PanelDock language="en" context={ctx} />);
    expect(screen.queryAllByRole("button").length).toBe(panelRegistry.length);
  });
});
