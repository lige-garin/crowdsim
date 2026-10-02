import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { demoScene } from "../scenes/demoScene";
import { templateScenes } from "../scenes/industryTemplates";
import { I18nProvider } from "../i18n";
import { SceneEditor } from "./SceneEditor";

vi.mock("./sceneFileExport", () => ({
  downloadSceneJson: vi.fn(),
}));

import { downloadSceneJson } from "./sceneFileExport";

const manualSlot = "crowdsim.scene.v1";
const autosaveSlot = "crowdsim.autosave.v1";

/*
 * Same jsdom patching as SceneEditor.test.tsx: the editor turns pointer
 * positions into scene metres through SVG geometry jsdom does not implement,
 * and captures the pointer on drag.
 */
beforeAll(() => {
  const proto = (globalThis as { SVGElement?: { prototype: unknown } }).SVGElement
    ?.prototype as Record<string, unknown> | undefined;
  if (!proto) return;
  proto.createSVGPoint ??= function () {
    return {
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
      x: 0,
      y: 0,
    };
  };
  proto.getScreenCTM ??= function () {
    return null;
  };
  const elements = (globalThis as { Element?: { prototype: unknown } }).Element
    ?.prototype as Record<string, unknown> | undefined;
  if (elements) {
    elements.setPointerCapture = function () {};
    elements.releasePointerCapture = function () {};
  }
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function renderEditor() {
  return render(
    <I18nProvider>
      <SceneEditor scene={demoScene} />
    </I18nProvider>,
  );
}

/** A scene that differs from demoScene but is still schema-valid. */
function otherScene() {
  return templateScenes[1];
}

function seedAutosave(scene: unknown, savedAtMs = 1_700_000_000_000) {
  localStorage.setItem(autosaveSlot, JSON.stringify({ savedAtMs, scene }));
}

describe("SceneEditor save chain (P0 from the 2026-10-02 review)", () => {
  it("falls back to a file export and says so when local storage rejects the save", () => {
    renderEditor();

    // jsdom wraps Storage in a proxy that silently drops instance-level
    // assignment, so the rejection has to be installed on the prototype.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    } finally {
      setItem.mockRestore();
    }

    // Before the fix this threw an uncaught exception and took the tree down;
    // the work must go out through the durable path instead.
    expect(downloadSceneJson).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadSceneJson).mock.calls[0][0].id).toBe(demoScene.id);
    expect(screen.getByText(/本地保存失败（存储配额不足）/)).toBeInTheDocument();
  });

  it("keeps the normal save path when storage is healthy", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(downloadSceneJson).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(manualSlot) ?? "null").id).toBe(
      demoScene.id,
    );
  });
});

describe("SceneEditor autosave recovery (P1 from the 2026-10-02 review)", () => {
  it("offers recovery once for an autosave that differs from the initial scene", () => {
    seedAutosave(otherScene());
    renderEditor();

    expect(screen.getByTestId("editor-autosave-banner")).toBeInTheDocument();
  });

  it("recovers the autosaved draft into the editor and clears the slot", () => {
    seedAutosave(otherScene());
    renderEditor();

    fireEvent.click(screen.getByTestId("editor-autosave-recover"));

    expect(screen.getByText("已恢复自动保存的草稿")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-autosave-banner")).toBeNull();
    expect(localStorage.getItem(autosaveSlot)).toBeNull();
  });

  it("discards the autosaved draft without touching the editor", () => {
    seedAutosave(otherScene());
    renderEditor();

    fireEvent.click(screen.getByTestId("editor-autosave-discard"));

    expect(screen.queryByTestId("editor-autosave-banner")).toBeNull();
    expect(localStorage.getItem(autosaveSlot)).toBeNull();
    expect(screen.queryByText("已恢复自动保存的草稿")).toBeNull();
  });

  it("stays quiet when the autosave matches the deliberately saved scene", () => {
    const other = otherScene();
    localStorage.setItem(manualSlot, JSON.stringify(other));
    seedAutosave(other);
    renderEditor();

    expect(screen.queryByTestId("editor-autosave-banner")).toBeNull();
    expect(localStorage.getItem(autosaveSlot)).toBeNull();
  });

  it("stays quiet when the autosave is just the untouched initial scene", () => {
    seedAutosave(demoScene);
    renderEditor();

    expect(screen.queryByTestId("editor-autosave-banner")).toBeNull();
    expect(localStorage.getItem(autosaveSlot)).toBeNull();
  });

  it("silently drops a corrupt autosave instead of prompting", () => {
    localStorage.setItem(autosaveSlot, "{not json at all");
    renderEditor();

    expect(screen.queryByTestId("editor-autosave-banner")).toBeNull();
    expect(localStorage.getItem(autosaveSlot)).toBeNull();
  });

  it("does not clobber a recoverable autosave by writing the initial document on mount", () => {
    seedAutosave(otherScene());
    renderEditor();

    // The mount run of the autosave effect used to schedule a 2 s write of
    // the untouched initial scene, destroying the recoverable draft before
    // the user had decided. Nothing may touch the slot for the initial doc.
    expect(localStorage.getItem(autosaveSlot)).not.toBeNull();
  });
});

describe("SceneEditor canvas keyboard shortcuts (P2 from the 2026-10-02 review)", () => {
  function canvas() {
    return screen.getByTestId("editor-canvas");
  }

  function drawCountLine() {
    fireEvent.click(screen.getByTestId("editor-tool-countLine"));
    fireEvent.pointerDown(canvas(), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas(), { clientX: 10, clientY: 30 });
    fireEvent.pointerUp(canvas(), { clientX: 10, clientY: 30 });
  }

  function countLines() {
    return document.querySelectorAll(".editor-count-line").length;
  }

  it("deletes the selection, then undoes and redoes it, from the keyboard", () => {
    renderEditor();
    drawCountLine();
    expect(countLines()).toBe(1);

    fireEvent.keyDown(canvas(), { key: "Delete" });
    expect(countLines()).toBe(0);

    fireEvent.keyDown(canvas(), { key: "z", ctrlKey: true }); // undo
    expect(countLines()).toBe(1);

    fireEvent.keyDown(canvas(), { key: "y", ctrlKey: true }); // redo
    expect(countLines()).toBe(0);

    fireEvent.keyDown(canvas(), { key: "z", ctrlKey: true }); // undo again
    expect(countLines()).toBe(1);

    fireEvent.keyDown(canvas(), { key: "z", ctrlKey: true, shiftKey: true }); // redo
    expect(countLines()).toBe(0);
  });

  it("also deletes with Backspace, but never from a text input", () => {
    renderEditor();
    drawCountLine();

    fireEvent.keyDown(canvas(), { key: "Backspace" });
    expect(countLines()).toBe(0);

    // Backspace while naming a line must keep its editor meaning, not delete
    // the entity — the handler lives on the canvas, not the document.
    fireEvent.keyDown(canvas(), { key: "z", ctrlKey: true }); // undo: line back
    // Undo restores the document but not the selection; pick the line again
    // so its name field appears.
    fireEvent.pointerDown(document.querySelector(".editor-count-line")!, {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.change(screen.getByTestId("count-line-name"), {
      target: { value: "North gate" },
    });
    fireEvent.keyDown(screen.getByTestId("count-line-name"), { key: "Backspace" });
    expect(countLines()).toBe(1);
  });
});
