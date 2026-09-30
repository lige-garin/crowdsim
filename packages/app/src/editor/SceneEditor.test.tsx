import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { demoScene } from "../scenes/demoScene";
import { I18nProvider } from "../i18n";
import { templateScenes } from "../scenes/industryTemplates";
import { SceneEditor } from "./SceneEditor";

/*
 * jsdom has no SVG geometry, and the editor turns a pointer position into
 * scene metres with it. Nothing else in this suite touches the canvas pointer
 * path, so it had never come up. With getScreenCTM returning null the editor
 * takes its documented fallback and reads the client coordinates as metres,
 * which is what these tests want anyway.
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
  // jsdom declares the pointer-capture methods but does not implement them, and
  // the editor captures the pointer when a drag starts. Left alone they throw
  // and the drag handler never gets as far as recording what is being dragged.
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
});

function renderEditor() {
  return render(
    <I18nProvider>
      <SceneEditor scene={demoScene} />
    </I18nProvider>,
  );
}

function uploadBasemap(container: HTMLElement, name: string) {
  const input = container.querySelector<HTMLInputElement>('input[accept="image/*"]');

  if (!input) {
    throw new Error("basemap input not found");
  }

  fireEvent.change(input, {
    target: { files: [new File(["png-bytes"], name, { type: "image/png" })] },
  });
}

describe("SceneEditor image geometry overlay", () => {
  it("shows an explicit empty state instead of fixture geometry for an upload", async () => {
    const { container } = renderEditor();

    uploadBasemap(container, "my-floor-plan.png");

    expect(await screen.findByText("此图未运行几何识别")).toBeInTheDocument();
    expect(screen.getAllByText("my-floor-plan.png").length).toBeGreaterThan(0);
    expect(container.querySelector(".ai-image-line")).toBeNull();
    expect(container.querySelector('[data-ai-kind="wall"]')).toBeNull();
  });

  it("renders fixture geometry only from the labelled tracing demo entry", async () => {
    const { container } = renderEditor();

    expect(container.querySelector(".ai-image-line")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "描图示例" }));

    await waitFor(() =>
      expect(container.querySelector(".ai-image-line")).toBeInTheDocument(),
    );
    expect(screen.getByText(/示例描图，非本图识别结果/)).toBeInTheDocument();
    expect(screen.getByText(/Mall floor plan/)).toBeInTheDocument();
  });

  it("drops the upload empty state once the tracing demo is shown", async () => {
    const { container } = renderEditor();

    uploadBasemap(container, "my-floor-plan.png");
    await screen.findByText("此图未运行几何识别");

    fireEvent.click(screen.getByRole("button", { name: "描图示例" }));

    expect(screen.queryByText("此图未运行几何识别")).toBeNull();
  });
});

describe("SceneEditor template scene draft", () => {
  it("refuses to draft anything until the user has typed a prompt", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "模板草稿" }));

    expect(screen.getByText("请先输入模板提示词")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Template Draft/ })).toBeNull();
  });

  it("drafts a hospital scene when the prompt asks for a hospital", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("模板提示词"), {
      target: { value: "hospital outpatient hall" },
    });
    fireEvent.click(screen.getByRole("button", { name: "模板草稿" }));

    expect(
      screen.getByRole("option", { name: "Hospital Template Draft" }),
    ).toBeInTheDocument();
    // The per-type counts sit behind the "对象" chip until it is opened.
    expect(screen.queryByText(/服务 2/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^对象 \d+/ }));
    expect(screen.getByText(/服务 2/)).toBeInTheDocument();
  });

  it("drafts a station scene when the prompt asks for a station", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("模板提示词"), {
      target: { value: "train station concourse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "模板草稿" }));

    expect(
      screen.getByRole("option", { name: "Station Template Draft" }),
    ).toBeInTheDocument();
  });

  it("drafts a mall scene when the prompt asks for a mall", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("模板提示词"), {
      target: { value: "mall circulation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "模板草稿" }));

    expect(screen.getByRole("option", { name: "商场模板草稿" })).toBeInTheDocument();
  });
});

describe("SceneEditor applies its working scene to the simulation", () => {
  function renderWithApply() {
    const applied: CrowdSimScene[] = [];

    render(
      <I18nProvider>
        <SceneEditor
          scene={demoScene}
          onApplyScene={(nextScene) => applied.push(nextScene)}
        />
      </I18nProvider>,
    );

    return applied;
  }

  it("hands the working scene back when the user asks to apply it", () => {
    const applied = renderWithApply();

    fireEvent.click(screen.getByTestId("editor-apply-scene"));

    expect(applied).toHaveLength(1);
    expect(applied[0].id).toBe(demoScene.id);
  });

  it("applies the EDITED scene, not the scene the shell is still running", () => {
    const applied = renderWithApply();
    const template = templateScenes[1];

    // Swap the editor's working copy to a template. The shell still runs
    // `demoScene` — applying must carry the editor's copy, which is the whole
    // point of the editor -> simulation loop.
    fireEvent.change(screen.getByLabelText("示例场景"), {
      target: { value: template.id },
    });
    fireEvent.click(screen.getByTestId("editor-apply-scene"));

    expect(applied).toHaveLength(1);
    expect(applied[0].id).toBe(template.id);
    expect(applied[0].id).not.toBe(demoScene.id);
  });

  it("never applies while editing — only the explicit button restarts the sim", () => {
    const applied = renderWithApply();

    fireEvent.change(screen.getByLabelText("示例场景"), {
      target: { value: templateScenes[1].id },
    });

    // Implicit sync here would restart the simulation on every drawn primitive.
    expect(applied).toHaveLength(0);

    fireEvent.click(screen.getByTestId("editor-apply-scene"));

    expect(applied).toHaveLength(1);
  });

  it("labels the control in both languages", () => {
    renderWithApply();

    expect(screen.getByTestId("editor-apply-scene").textContent).toContain(
      "应用到仿真",
    );
  });
});

describe("SceneEditor DXF import wiring", () => {
  it("imports a DXF floor plan through the hidden file input", async () => {
    const { container } = renderEditor();

    // The control is there and routes through a hidden, typed file input.
    expect(screen.getByRole("button", { name: "导入 DXF" })).toBeInTheDocument();

    const input = container.querySelector<HTMLInputElement>('input[accept*=".dxf"]');
    expect(input).not.toBeNull();

    // A minimal four-vertex polyline -> one imported wall.
    const dxf = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "WALLS",
      "10",
      "0",
      "20",
      "0",
      "10",
      "10",
      "20",
      "0",
      "10",
      "10",
      "20",
      "10",
      "10",
      "0",
      "20",
      "10",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");

    fireEvent.change(input!, {
      target: {
        files: [new File([dxf], "plan.dxf", { type: "application/dxf" })],
      },
    });

    expect(await screen.findByText(/已导入 DXF：1 面墙/)).toBeInTheDocument();
  });

  it("reports an invalid DXF instead of silently importing nothing", async () => {
    const { container } = renderEditor();

    const input = container.querySelector<HTMLInputElement>('input[accept*=".dxf"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, {
      target: {
        files: [new File(["not a dxf"], "broken.dxf", { type: "application/dxf" })],
      },
    });

    expect(await screen.findByText("DXF 无效")).toBeInTheDocument();
  });
});

describe("count lines in the 2D editor", () => {
  function canvas() {
    return screen.getByTestId("editor-canvas");
  }

  function dragOnCanvas(from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(canvas(), { clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(canvas(), { clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(canvas(), { clientX: to[0], clientY: to[1] });
  }

  function linePoints() {
    const line = document.querySelector(".editor-count-line");
    return line?.getAttribute("points") ?? null;
  }

  function pickCountLineTool() {
    fireEvent.click(screen.getByTestId("editor-tool-countLine"));
  }

  it("draws a line where it is dragged, at any angle, not a fixed east-west one", () => {
    renderEditor();
    expect(linePoints()).toBeNull();

    pickCountLineTool();
    // 20 m straight down: an east-west default would come out horizontal.
    dragOnCanvas([10, 10], [10, 30]);

    expect(linePoints()).toBe("10,10 10,30");
  });

  it("lets one end be dragged without moving the other", () => {
    renderEditor();
    pickCountLineTool();
    dragOnCanvas([10, 10], [10, 30]);

    // After placing, the new line is selected, so its ends have handles.
    const start = screen.getByTestId("count-line-end-0");
    fireEvent.pointerDown(start, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas(), { clientX: 20, clientY: 10 });
    fireEvent.pointerUp(canvas(), { clientX: 20, clientY: 10 });

    expect(linePoints()).toBe("20,10 10,30");
  });

  it("names a line, and the plan shows that name instead of COUNT", () => {
    renderEditor();
    pickCountLineTool();
    dragOnCanvas([10, 10], [10, 30]);

    fireEvent.change(screen.getByTestId("count-line-name"), {
      target: { value: "North gate" },
    });

    expect(document.querySelector(".editor-count-label")?.textContent).toBe(
      "North gate",
    );
  });

  it("still drops a line when the tool is clicked without a drag", () => {
    renderEditor();
    pickCountLineTool();
    dragOnCanvas([10, 10], [10, 10]);

    // The single-click form, so the tool never leaves you with nothing.
    expect(linePoints()).toBe("10,10 18,10");
  });
});

describe("floors in the 2D editor", () => {
  function canvas() {
    return screen.getByTestId("editor-canvas");
  }

  function countLines() {
    return document.querySelectorAll(".editor-count-line").length;
  }

  function drawCountLine(from: [number, number], to: [number, number]) {
    fireEvent.click(screen.getByTestId("editor-tool-countLine"));
    fireEvent.pointerDown(canvas(), { clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(canvas(), { clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(canvas(), { clientX: to[0], clientY: to[1] });
  }

  it("starts with no floors to choose between, because there is one plane", () => {
    renderEditor();

    expect(screen.getByTestId("editor-floors")).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="editor-floor-"]')).toHaveLength(0);
  });

  it("adds a floor above and draws on it, leaving the floor below alone", () => {
    renderEditor();
    const before = countLines();

    fireEvent.click(screen.getByTestId("editor-add-floor"));
    const floors = document.querySelectorAll<HTMLButtonElement>(
      '[data-testid^="editor-floor-"]',
    );

    expect(floors).toHaveLength(2);
    expect(floors[1].getAttribute("aria-pressed")).toBe("true");
    // The plan starts empty up here: everything drawn so far is downstairs.
    expect(countLines()).toBe(0);

    drawCountLine([10, 10], [10, 30]);
    expect(countLines()).toBe(1);

    fireEvent.click(floors[0]);
    expect(floors[0].getAttribute("aria-pressed")).toBe("true");
    expect(countLines()).toBe(before);

    fireEvent.click(floors[1]);
    expect(countLines()).toBe(1);
  });

  it("says what joins the floors, and what is not modelled", () => {
    renderEditor();

    // The bar's own note, not the toolbar button of the same name.
    expect(document.querySelector(".editor-floorbar-note")?.textContent).toMatch(
      /lifts not modelled|电梯未建模/,
    );
  });
});
