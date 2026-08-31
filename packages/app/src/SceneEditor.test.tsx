import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { demoScene } from "./demoScene";
import { I18nProvider } from "./i18n";
import { templateScenes } from "./industryTemplates";
import { SceneEditor } from "./SceneEditor";

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
