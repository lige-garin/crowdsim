import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// The evacuation mode lives in the WASM behaviour runtime, which does not load
// in jsdom; give it the same answers the real module gives.
vi.mock("./behaviorWasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./behaviorWasm")>()),
  initBehaviorWasm: vi.fn().mockResolvedValue(undefined),
  resetBehaviorModeWasm: vi.fn().mockResolvedValue({ active: false, label: "Normal" }),
  triggerEvacuationWithBehaviorWasm: vi
    .fn()
    .mockResolvedValue({ active: true, label: "Evacuating" }),
}));

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderWorkbench() {
  render(<App />);
  // Basic mode (template gallery) is the new default (uiMode.ts); this
  // helper exercises the classic expert-mode workbench.
  fireEvent.click(screen.getByRole("button", { name: "切到专家模式" }));
  fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));
}

const pressed = (testId: string) =>
  screen.getByTestId(testId).getAttribute("aria-pressed");

/**
 * Combinations of view, tab and held tool that used to leave the user with a
 * lit control that did nothing.
 */
describe("view, tab and tool stay consistent", () => {
  it("opens the editor from the network view", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("view-mode-network"));
    expect(document.querySelector(".contact-network-view")).not.toBeNull();

    fireEvent.click(screen.getByTestId("stage-tab-edit"));

    // The network view used to win, so the edit key lit and nothing appeared.
    expect(screen.getByLabelText("编辑工具")).toBeVisible();
    expect(document.querySelector(".contact-network-view")).toBeNull();
    expect(pressed("view-mode-network")).toBe("false");
  });

  it("drops a held tool when switching to a view that cannot use it", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("build-category-structure"));
    fireEvent.click(screen.getByTestId("palette-building"));
    expect(pressed("palette-building")).toBe("true");

    fireEvent.click(screen.getByTestId("view-mode-2d"));

    expect(pressed("palette-building")).toBe("false");
    expect(pressed("palette-select")).toBe("true");
    expect(pressed("build-category-structure")).toBe("false");
  });

  it("keeps a placeable tool when returning to the 3D view", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("build-category-structure"));
    fireEvent.click(screen.getByTestId("palette-building"));

    fireEvent.click(screen.getByTestId("view-mode-3d"));

    expect(pressed("palette-building")).toBe("true");
  });

  it("drops the wall tool on the way back to 3D, where walls cannot be drawn", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("build-category-structure"));
    fireEvent.click(screen.getByTestId("palette-wall"));
    expect(pressed("stage-tab-edit")).toBe("true");

    fireEvent.click(screen.getByTestId("view-mode-3d"));

    expect(pressed("palette-wall")).toBe("false");
    expect(pressed("build-category-structure")).toBe("false");
  });

  it("disables the 3D build undo on the editor tab", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("stage-tab-edit"));
    expect(screen.getByTestId("build-undo")).toBeDisabled();
  });
});

describe("the editor keeps unapplied work across views", () => {
  it("still holds an edit after a look at the city", () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("stage-tab-edit"));
    // An unapplied edit.
    fireEvent.change(screen.getByLabelText("示例场景"), {
      target: { value: "mall-atrium" },
    });
    const pickedScene = (screen.getByLabelText("示例场景") as HTMLSelectElement).value;
    expect(pickedScene).toBe("mall-atrium");

    fireEvent.click(screen.getByTestId("view-mode-3d"));
    expect(screen.getByLabelText("编辑工具", { selector: "*" })).not.toBeVisible();
    fireEvent.click(screen.getByTestId("stage-tab-edit"));

    expect((screen.getByLabelText("示例场景") as HTMLSelectElement).value).toBe(
      pickedScene,
    );
  });
});

describe("reset", () => {
  it("ends an evacuation along with the run", async () => {
    renderWorkbench();
    await act(async () => {
      fireEvent.click(screen.getByTestId("evacuate-toggle"));
    });
    await waitFor(() => expect(pressed("evacuate-toggle")).toBe("true"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("sim-reset"));
    });

    await waitFor(() => expect(pressed("evacuate-toggle")).toBe("false"));
  });
});
