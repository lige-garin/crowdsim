import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderWorkbench() {
  render(<App />);
  // Basic mode (template gallery) is the new default (uiMode.ts); this
  // helper exercises the classic expert-mode workbench, whose build rail
  // these tests cover -- basic mode has no build rail at all.
  fireEvent.click(screen.getByRole("button", { name: "切到专家模式" }));
  fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));
}

/**
 * The palette this replaced had 16 buttons whose only effect was their own
 * highlight. These specs assert the opposite property end to end: pressing a
 * palette entry changes something outside the palette.
 *
 * The rail is icons only while docked, so entries are addressed by test id and
 * by accessible name — there is deliberately no visible text to query.
 */
describe("build rail is wired to real state", () => {
  it("holds a one-click tool in the 3D city instead of leaving for the editor", () => {
    renderWorkbench();

    // Tools live one level down: the docked rail shows categories, the flyout
    // shows the tools in the category you opened.
    expect(screen.queryByTestId("palette-shop")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("build-category-commerce"));
    fireEvent.click(screen.getByTestId("palette-shop"));

    // The city is where you build: the run view stays, the tool is held.
    expect(screen.getByTestId("palette-shop")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("stage-tab-edit")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByLabelText("编辑工具")).not.toBeInTheDocument();
    // Undo exists but has nothing to undo yet.
    expect(screen.getByTestId("build-undo")).toBeDisabled();
  });

  it("opens the 2D editor for a tool the world cannot place yet", () => {
    renderWorkbench();

    // A wall is a run of clicks; the 3D world only does single placements.
    fireEvent.click(screen.getByTestId("build-category-structure"));
    fireEvent.click(screen.getByTestId("palette-wall"));

    expect(screen.getByTestId("stage-tab-edit")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const editorToolbar = within(screen.getByLabelText("编辑工具"));
    expect(editorToolbar.getByTestId("editor-tool-wall")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the palette in step when the editor changes its own tool", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("stage-tab-edit"));

    fireEvent.click(screen.getByTestId("build-category-structure"));
    fireEvent.click(screen.getByTestId("palette-road"));
    expect(screen.getByTestId("palette-road")).toHaveAttribute("aria-pressed", "true");

    // Driven from the editor's own toolbar, not the palette.
    fireEvent.click(screen.getByTestId("editor-tool-wall"));

    expect(screen.getByTestId("palette-road")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("palette-wall")).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles viewport layers instead of showing a permanently ticked box", () => {
    renderWorkbench();

    // Layers are info views: they live on the info rail and recolour the scene
    // in place rather than opening anything.
    const heatmap = screen.getByTestId("palette-layer-heatmap");

    // Analysis layers open off so the city is not painted over by default.
    expect(heatmap).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(heatmap);
    expect(screen.getByTestId("palette-layer-heatmap")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByTestId("palette-layer-heatmap"));
    expect(screen.getByTestId("palette-layer-heatmap")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
