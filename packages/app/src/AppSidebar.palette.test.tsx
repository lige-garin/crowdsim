import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderWorkbench() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));
}

/**
 * The palette this replaced had 16 buttons whose only effect was their own
 * highlight. These specs assert the opposite property end to end: pressing a
 * palette entry changes something outside the palette.
 */
describe("workspace palette is wired to real state", () => {
  it("selects the scene-editor tool the entry names", () => {
    renderWorkbench();

    const editorToolbar = within(screen.getByLabelText("编辑工具"));

    expect(editorToolbar.getByTestId("editor-tool-shop")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByTestId("palette-shop"));

    expect(editorToolbar.getByTestId("editor-tool-shop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("palette-shop")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the palette in step when the editor changes its own tool", () => {
    renderWorkbench();

    fireEvent.click(screen.getByTestId("palette-road"));
    expect(screen.getByTestId("palette-road")).toHaveAttribute("aria-pressed", "true");

    // Driven from the editor's own toolbar, not the palette.
    fireEvent.click(screen.getByTestId("editor-tool-wall"));

    expect(screen.getByTestId("palette-road")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("palette-wall")).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles viewport layers instead of showing a permanently ticked box", () => {
    renderWorkbench();

    const heatmap = screen.getByTestId("palette-layer-heatmap");

    expect(heatmap).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(heatmap);
    expect(screen.getByTestId("palette-layer-heatmap")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByTestId("palette-layer-heatmap"));
    expect(screen.getByTestId("palette-layer-heatmap")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
