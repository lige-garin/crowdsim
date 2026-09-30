import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./engine/behaviorWasm", () => ({
  addWithBehaviorWasm: vi.fn().mockResolvedValue(42),
  createWasmSimulationDecisionBackend: vi.fn().mockResolvedValue({
    decisionHz: 10,
    decideAgents: vi.fn(() => []),
    dispose: vi.fn(),
    id: "wasm-ready",
  }),
  initBehaviorWasm: vi.fn().mockResolvedValue(undefined),
  runAgentStateMachineWasmProbe: vi.fn().mockResolvedValue({
    finalCode: 5,
    labels: [
      "Idle",
      "Navigate",
      "Browse",
      "Evacuate",
      "Browse",
      "Queue",
      "Service",
      "Leave",
    ],
    restoredLabel: "Browse",
    sabStateLabels: [
      "Idle",
      "Navigate",
      "Browse",
      "Queue",
      "Service",
      "Leave",
      "Evacuate",
    ],
  }),
  runDiscreteEventWasmProbe: vi.fn().mockResolvedValue({
    labels: ["0.50:arrive#2", "2.00:open-shop#1", "2.25:finish-service#3"],
    now: 2.25,
    pending: 0,
    ready: 0,
  }),
  runQueueSystemWasmProbe: vi.fn().mockResolvedValue({
    dequeued: [201, 202],
    layout: "#201@10.00,20.00 | #202@10.00,21.50 | #203@10.00,23.00",
    serviceTimes: [24, 30, 36],
    throughput: 60,
  }),
  runShopDecisionWasmProbe: vi.fn().mockResolvedValue({
    browserSummary: "Browser -> gallery p=0.38 dwell=324s capacity=12",
    commuterChoice: "kiosk",
    goalChoice: "anchor",
    profileLabels: ["Goal", "Browser", "Commuter"],
    shopCount: 3,
  }),
  resetBehaviorModeWasm: vi.fn().mockResolvedValue({
    active: false,
    label: "Normal",
  }),
  triggerEvacuationWithBehaviorWasm: vi.fn().mockResolvedValue({
    active: true,
    label: "Evacuating",
  }),
}));

vi.mock("./webgpuProbe", () => ({
  runWebGpuProbe: vi.fn().mockResolvedValue({
    status: "ready",
    supported: true,
    input: [1, 2, 3, 4],
    output: [2, 4, 6, 8],
    message: "Compute shader complete",
  }),
}));

vi.mock("./gpuGridProbe", () => ({
  runGpuGridProbe: vi.fn().mockResolvedValue({
    status: "ready",
    message: "Grid readback verified",
    cellIds: [0, 1, 0, 3],
    cellCounts: [2, 1, 0, 1],
    cellOffsets: [0, 2, 3, 3, 4],
    sortedAgentIds: [0, 2, 1, 3],
  }),
}));

vi.mock("./socialForceProbe", () => ({
  runSocialForceProbe: vi.fn().mockResolvedValue({
    status: "ready",
    message: "Social force verified",
    positions: [0.002, 0, 0.537, 0, 2.018, 0.198],
    velocities: [0.02, 0, 0.37, 0, 0.18, -0.02],
  }),
}));

vi.mock("./flowFieldProbe", () => ({
  runFlowFieldProbe: vi.fn().mockResolvedValue({
    status: "ready",
    message: "Flow field verified",
    directions: [1, 0, 1, 0, 0, 0],
  }),
}));

vi.mock("./heatmapProbe", () => ({
  runHeatmapProbe: vi.fn().mockResolvedValue({
    status: "ready",
    message: "Heatmap density verified",
    cellCounts: [2, 1, 0, 1],
    maxCount: 2,
  }),
}));

vi.mock("./movementBackendProbe", () => ({
  runMovementBackendProbe: vi.fn().mockResolvedValue({
    activeBackend: "cpu-compat",
    message: "WebGPU movement readback verified",
    positions: [0.1, 0],
    readyBackend: "webgpu-ready",
    status: "ready",
    velocities: [1, 0],
  }),
}));

vi.mock("./sharedArrayBufferProbe", () => ({
  createSharedArrayBufferSummary: vi.fn(() => "SAB ready | isolated | 16 bytes"),
  runSharedArrayBufferProbe: vi.fn(() => ({
    atomicsAvailable: true,
    byteLength: 16,
    crossOriginIsolated: true,
    message: "SAB sync ready",
    sabAvailable: true,
    status: "ready",
    value: 7,
  })),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderWorkbench() {
  render(<App />);
  // Basic mode (template gallery) is the new default (uiMode.ts); these
  // tests exercise the classic expert-mode workbench, which basic mode's
  // home screen no longer shows a "进入运营台" button for directly -- switch
  // to expert mode first. Basic mode's own path has its own coverage in
  // AppHome.uiMode.test.tsx.
  fireEvent.click(screen.getByRole("button", { name: "切到专家模式" }));
  fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));
}

describe("App", () => {
  it("starts from home, enters the workbench, and can return home", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "CrowdSim Operations" }),
    ).toBeInTheDocument();

    // Basic mode is the default; this test exercises the expert-mode
    // workbench path.
    fireEvent.click(screen.getByRole("button", { name: "切到专家模式" }));
    fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));

    expect(screen.getByLabelText("状态栏")).toBeInTheDocument();
    expect(screen.getByLabelText("建造工具")).toBeInTheDocument();
    expect(screen.getByLabelText("信息视图")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "首页" }));

    expect(
      screen.getByRole("heading", { name: "CrowdSim Operations" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    fireEvent.click(screen.getByRole("button", { name: "View network" }));

    expect(
      screen.getByRole("heading", { name: "Crowd Contact Network" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    expect(
      screen.getByRole("heading", { name: "CrowdSim Operations" }),
    ).toBeInTheDocument();
  });

  it("renders the compact workbench shell", () => {
    renderWorkbench();

    // The shell is a status bar and two icon rails over a full-bleed scene.
    // Nothing docked carries a written label, so these assert the rails by
    // their accessible names rather than by any text on screen.
    expect(screen.getByLabelText("状态栏")).toBeInTheDocument();
    expect(screen.getByLabelText("建造工具")).toBeInTheDocument();
    expect(screen.getByLabelText("信息视图")).toBeInTheDocument();
    expect(screen.getByLabelText("仿真时钟")).toBeInTheDocument();
    // The hardcoded milestone list (T0.1 scaffold / T0.2 wasm bridge / ...) was
    // frozen months ago and reported progress that no longer existed.
    expect(screen.queryByText("T0.1")).not.toBeInTheDocument();
    // "Evidence: Verified" was a literal, next to a literal "WASM + SAB"
    // kernel. Neither was measured and the GPU path is explicitly unverified.
    expect(screen.queryByText("已验证")).not.toBeInTheDocument();
    expect(screen.queryByText("WASM + SAB")).not.toBeInTheDocument();
    expect(screen.getByLabelText("仿真视口")).toBeInTheDocument();
    expect(screen.getAllByText("雨天商业街").length).toBeGreaterThan(0);
    // "BioCity key metrics" was the inspector's copy of footfall / exited /
    // density peak / trajectory frames — the fourth rendering of numbers the
    // stage telemetry already owns. The rail leads with analysis now.
    expect(screen.queryByLabelText("BioCity key metrics")).not.toBeInTheDocument();
    // Analytics are opened on demand, not docked: the rail button exists, the
    // panel does not until it is asked for.
    expect(screen.queryByLabelText("场景分析")).not.toBeInTheDocument();
    expect(screen.getByTestId("info-window-analytics")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("info-window-analytics"));
    // Region names follow the interface language (they were English-only).
    expect(screen.getByLabelText("场景分析")).toBeInTheDocument();
    expect(screen.getByLabelText("场景对象")).toBeInTheDocument();
    expect(screen.getByLabelText("系统与记录")).toBeInTheDocument();
    expect(screen.getByLabelText("工程状态")).toBeInTheDocument();
    expect(screen.queryByText("Credibility loop")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("info-window-analytics"));
    expect(screen.queryByLabelText("场景分析")).not.toBeInTheDocument();

    // The editor opens from the HUD's edit button.
    fireEvent.click(screen.getByTestId("stage-tab-edit"));

    // The scene-draft button used to double as the image-tracing trigger, which
    // put fixture geometry on screen for a scene nobody had traced. Tracing
    // geometry now has its own labelled entry.
    fireEvent.click(screen.getByRole("button", { name: /^文件/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "模板草稿" }));

    expect(screen.queryByLabelText("描图图层（示例）")).not.toBeInTheDocument();
    expect(screen.getByText("请先输入模板提示词")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^文件/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "描图示例" }));

    expect(screen.getByLabelText("描图图层（示例）")).toBeInTheDocument();
    expect(screen.getAllByText(/复核/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    // The shell translates through accessible names, because it has no visible
    // ones: every docked control is an icon.
    expect(screen.getByLabelText("Status bar")).toBeInTheDocument();
    expect(screen.getByLabelText("Build tools")).toBeInTheDocument();
    expect(screen.getByLabelText("Info views")).toBeInTheDocument();
    expect(screen.getByTestId("sim-toggle")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/Start|Pause/),
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByLabelText(/simulation viewport/i)).toBeInTheDocument();
    expect(screen.queryByText("Movement backend")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("view-mode-network"));

    expect(
      screen.getByRole("heading", { name: "Crowd Contact Network" }),
    ).toBeInTheDocument();
  });

  it("keeps modelled commercial estimates out of the status bar", () => {
    renderWorkbench();

    const statusBar = within(screen.getByLabelText("状态栏"));

    // Live values only. The heuristic revenue and satisfaction figures are
    // modelled, not measured, so they never appear in always-visible chrome.
    expect(statusBar.getByTestId("hud-agent-count")).toBeInTheDocument();
    expect(statusBar.queryByText(/销售/)).not.toBeInTheDocument();
    expect(statusBar.queryByText(/满意度/)).not.toBeInTheDocument();

    // Docked chrome carries no written labels at all — the rails are icons and
    // the names live in aria-label/title.
    for (const label of ["仿真", "客流", "运行控制", "仿真倍率", "绘制", "图层"]) {
      expect(statusBar.queryByText(label)).not.toBeInTheDocument();
    }

    // Tools are opened from the info rail, not docked along the bottom.
    expect(screen.queryByLabelText("工具面板")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("info-window-tools"));
    expect(
      within(screen.getByLabelText("工具面板")).getByText("工具与实验"),
    ).toBeInTheDocument();
  });

  it("switches the viewport between 2D and 3D modes", () => {
    renderWorkbench();

    const twoDimensionalButton = screen.getByTestId("view-mode-2d");
    const threeDimensionalButton = screen.getByTestId("view-mode-3d");

    expect(twoDimensionalButton).toHaveAttribute("aria-pressed", "false");
    expect(threeDimensionalButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(twoDimensionalButton);

    expect(twoDimensionalButton).toHaveAttribute("aria-pressed", "true");
    expect(threeDimensionalButton).toHaveAttribute("aria-pressed", "false");
  });

  describe("basic mode (uiMode.ts default)", () => {
    it("picking a template enters a stripped-down run view with the dashboard already open", () => {
      render(<App />);

      // Basic mode's home screen is the template gallery, not the classic
      // hero buttons -- picking any card is step one of the four-step path.
      const firstCard = screen.getAllByRole("button", {
        name: /地铁站厅|商场中庭/,
      })[0];
      fireEvent.click(firstCard);

      // Step three, "watch the dashboard," is already open -- a basic-mode
      // user has no reason to know an info-rail icon exists to open it.
      expect(screen.getByTestId("hud-window-analytics")).toBeInTheDocument();

      // The build toolbar and info rail are expert-mode surfaces.
      expect(screen.queryByLabelText("建造工具")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("信息视图")).not.toBeInTheDocument();

      // Step four is one button, not a trip through the tools window.
      expect(screen.getByTestId("hud-report-trigger")).toBeInTheDocument();
    });

    it("the report button opens the real scene's validation report panel", () => {
      render(<App />);
      fireEvent.click(
        screen.getAllByRole("button", {
          name: /地铁站厅|商场中庭/,
        })[0],
      );

      fireEvent.click(screen.getByTestId("hud-report-trigger"));

      expect(screen.getByTestId("hud-window-report")).toBeInTheDocument();
    });

    it("expert mode shows none of the basic-mode-only chrome", () => {
      renderWorkbench();

      expect(screen.queryByTestId("hud-report-trigger")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Rail station concourse/ }),
      ).not.toBeInTheDocument();
    });
  });
});
