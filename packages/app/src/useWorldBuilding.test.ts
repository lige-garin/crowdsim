import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultDemoScene } from "./defaultDemoScene";
import { useWorldBuilding } from "./useWorldBuilding";

function setup() {
  const applied: CrowdSimScene[] = [];
  const onCancelTool = vi.fn();
  const hook = renderHook(
    ({ scene }: { scene: CrowdSimScene }) =>
      useWorldBuilding({
        applyScene: (next) => {
          applied.push(next);
          hook.rerender({ scene: next });
        },
        enabled: true,
        onCancelTool,
        scene,
      }),
    { initialProps: { scene: defaultDemoScene } },
  );
  return { applied, hook, onCancelTool };
}

describe("useWorldBuilding", () => {
  it("commits each placement and undoes back to the scene before it", () => {
    const { applied, hook } = setup();
    expect(hook.result.current.canUndo).toBe(false);

    act(() => hook.result.current.place("shop", { x: 40, y: 86 }));
    act(() => hook.result.current.place("shop", { x: 60, y: 86 }));
    expect(applied.at(-1)!.shops).toHaveLength(defaultDemoScene.shops.length + 2);
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo());
    expect(applied.at(-1)!.shops).toHaveLength(defaultDemoScene.shops.length + 1);
    act(() => hook.result.current.undo());
    expect(applied.at(-1)).toBe(defaultDemoScene);
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("drops history when the scene changes some other way, so undo never discards it", () => {
    const { hook } = setup();
    act(() => hook.result.current.place("road", { x: 40, y: 86 }));
    expect(hook.result.current.canUndo).toBe(true);

    // e.g. "apply" from the 2D editor.
    act(() => hook.rerender({ scene: { ...defaultDemoScene, name: "edited" } }));
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("refuses a placement onto something solid and records nothing", () => {
    const { applied, hook } = setup();
    // Rain Market Avenue runs along y = 54.
    act(() => hook.result.current.place("building", { x: 80, y: 54 }));
    expect(applied).toHaveLength(0);
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("ignores a click with a tool that does not place", () => {
    const { applied, hook } = setup();
    act(() => hook.result.current.place("wall", { x: 40, y: 86 }));
    expect(applied).toHaveLength(0);
  });

  it("Escape drops the tool and Ctrl+Z undoes", () => {
    const { applied, hook, onCancelTool } = setup();
    act(() => hook.result.current.place("shop", { x: 40, y: 86 }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "z" }));
    });
    expect(onCancelTool).toHaveBeenCalled();
    expect(applied.at(-1)).toBe(defaultDemoScene);
  });
});

describe("useWorldBuilding outside the 3D run view", () => {
  it("offers no undo, and keeps the history for when the user comes back", () => {
    let current: CrowdSimScene = defaultDemoScene;
    const hook = renderHook(
      ({ enabled, scene }: { enabled: boolean; scene: CrowdSimScene }) =>
        useWorldBuilding({
          applyScene: (next) => {
            current = next;
          },
          enabled,
          onCancelTool: () => undefined,
          scene,
        }),
      { initialProps: { enabled: true, scene: defaultDemoScene } },
    );
    act(() => hook.result.current.place("shop", { x: 40, y: 86 }));
    hook.rerender({ enabled: true, scene: current });
    expect(hook.result.current.canUndo).toBe(true);

    // The editor tab: undoing a 3D placement there changed the scene under the
    // editor's open document.
    hook.rerender({ enabled: false, scene: current });
    expect(hook.result.current.canUndo).toBe(false);
    act(() => hook.result.current.undo());
    expect(current).not.toBe(defaultDemoScene);

    hook.rerender({ enabled: true, scene: current });
    expect(hook.result.current.canUndo).toBe(true);
  });
});

describe("useWorldBuilding: placeLine (ADR-0031)", () => {
  it("commits a count line between two real points, and undoes it like any other placement", () => {
    const { applied, hook } = setup();

    act(() => hook.result.current.placeLine({ x: 30, y: 40 }, { x: 70, y: 55 }));

    expect(applied.at(-1)!.countLines).toHaveLength(
      defaultDemoScene.countLines.length + 1,
    );
    expect(applied.at(-1)!.countLines.at(-1)!.geometry.points).toEqual([
      { x: 30, y: 40 },
      { x: 70, y: 55 },
    ]);
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo());
    expect(applied.at(-1)).toBe(defaultDemoScene);
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("shares the same undo stack as single-point placements", () => {
    const { applied, hook } = setup();

    act(() => hook.result.current.place("shop", { x: 40, y: 86 }));
    act(() => hook.result.current.placeLine({ x: 30, y: 40 }, { x: 70, y: 55 }));
    expect(applied.at(-1)!.shops).toHaveLength(defaultDemoScene.shops.length + 1);
    expect(applied.at(-1)!.countLines).toHaveLength(
      defaultDemoScene.countLines.length + 1,
    );

    act(() => hook.result.current.undo());
    expect(applied.at(-1)!.countLines).toHaveLength(defaultDemoScene.countLines.length);
    expect(applied.at(-1)!.shops).toHaveLength(defaultDemoScene.shops.length + 1);
  });
});
