import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { I18nProvider } from "./i18n";
import { templateScenes } from "./industryTemplates";
import { SceneEditor } from "./SceneEditor";
import { NumberInput } from "./SceneEditorParamInputs";
import { placeInScene } from "./worldPlacement";

beforeEach(() => {
  // jsdom has no pointer capture; the editor calls it when an entity is picked.
  Element.prototype.setPointerCapture = vi.fn();
  // Nor SVG geometry; the drag that starts on pick asks for a point.
  const proto = SVGElement.prototype as unknown as {
    createSVGPoint?: () => unknown;
    getScreenCTM?: () => null;
  };
  proto.createSVGPoint = () => ({ x: 0, y: 0 });
  proto.getScreenCTM = () => null;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderEditor(scene: CrowdSimScene, onApplyScene = vi.fn()) {
  const view = render(
    <I18nProvider>
      <SceneEditor scene={scene} onApplyScene={onApplyScene} />
    </I18nProvider>,
  );
  const rerender = (next: CrowdSimScene) =>
    view.rerender(
      <I18nProvider>
        <SceneEditor scene={next} onApplyScene={onApplyScene} />
      </I18nProvider>,
    );
  return { ...view, onApplyScene, rerender };
}

const buildingCount = (container: HTMLElement) =>
  container.querySelectorAll("g.editor-building").length;

describe("SceneEditor stays in step with the live scene", () => {
  it("takes an outside change silently while it holds no edits", () => {
    const { container, rerender } = renderEditor(bioCityDemoScene);
    const before = buildingCount(container);

    // A building placed in the 3D world while the editor was open or hidden.
    rerender(placeInScene(bioCityDemoScene, "building", { x: 40, y: 86 })!);

    expect(buildingCount(container)).toBe(before + 1);
    expect(screen.queryByTestId("editor-stale-banner")).toBeNull();
  });

  it("keeps its own edits and warns when the live scene changes underneath", () => {
    const { container, rerender } = renderEditor(bioCityDemoScene);
    // An unapplied edit: swap the working copy to a template.
    fireEvent.change(screen.getByLabelText("示例场景"), {
      target: { value: templateScenes[1].id },
    });
    const editedBuildings = buildingCount(container);

    rerender(placeInScene(bioCityDemoScene, "building", { x: 40, y: 86 })!);

    expect(buildingCount(container)).toBe(editedBuildings);
    expect(screen.getByTestId("editor-stale-banner")).toBeInTheDocument();
  });

  it("reloads the live scene on request, dropping the stale edits", () => {
    const { container, rerender } = renderEditor(bioCityDemoScene);
    fireEvent.change(screen.getByLabelText("示例场景"), {
      target: { value: templateScenes[1].id },
    });
    const live = placeInScene(bioCityDemoScene, "building", { x: 40, y: 86 })!;
    rerender(live);

    fireEvent.click(screen.getByTestId("editor-reload-live-scene"));

    expect(screen.queryByTestId("editor-stale-banner")).toBeNull();
    expect(buildingCount(container)).toBe(live.buildings.length);
  });

  it("does not warn about the scene it applied itself", () => {
    const { onApplyScene, rerender } = renderEditor(bioCityDemoScene);
    fireEvent.change(screen.getByLabelText("示例场景"), {
      target: { value: templateScenes[1].id },
    });
    fireEvent.click(screen.getByTestId("editor-apply-scene"));
    const applied = onApplyScene.mock.calls[0][0] as CrowdSimScene;

    // The shell hands the applied scene straight back as the live one.
    rerender(applied);

    expect(screen.queryByTestId("editor-stale-banner")).toBeNull();
  });
});

describe("SceneEditor parameter edits", () => {
  it("are undoable, one step per entity however many keystrokes", () => {
    const { container } = renderEditor(bioCityDemoScene);
    const building = container.querySelector("g.editor-building")!;
    fireEvent.pointerDown(building);
    const floors = screen.getByLabelText("楼层") as HTMLInputElement;
    const original = floors.value;

    fireEvent.change(floors, { target: { value: "1" } });
    fireEvent.change(floors, { target: { value: "12" } });
    expect((screen.getByLabelText("楼层") as HTMLInputElement).value).toBe("12");

    fireEvent.click(screen.getByTestId("editor-undo"));

    // Undo deselects; pick the building again to read its value.
    fireEvent.pointerDown(container.querySelector("g.editor-building")!);
    expect((screen.getByLabelText("楼层") as HTMLInputElement).value).toBe(original);
  });
});

describe("NumberInput", () => {
  it("lets a field be emptied and retyped without committing zero", () => {
    const onChange = vi.fn();
    render(
      <NumberInput label="rate" min={0} step={1} value={120} onChange={onChange} />,
    );
    const input = screen.getByLabelText("rate") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith(30);

    // Leaving the field shows the committed value again.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("120");
  });
});
