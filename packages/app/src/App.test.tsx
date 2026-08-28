import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./behaviorWasm", () => ({
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
  fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));
}

describe("App", () => {
  it("starts from home, enters the BioCity studio, and can return home", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "CrowdSim Operations" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "进入运营台" }));

    expect(screen.getByRole("heading", { name: "BioCity Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity operating status")).toBeInTheDocument();
    expect(screen.getByLabelText("仿真时钟")).toBeInTheDocument();

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

  it("renders the compact BioCity studio shell", () => {
    renderWorkbench();

    expect(screen.getByRole("heading", { name: "BioCity Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity operating status")).toBeInTheDocument();
    expect(screen.getByLabelText("绘制")).toBeInTheDocument();
    expect(screen.getByLabelText("图层")).toBeInTheDocument();
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
    expect(screen.getByLabelText("BioCity key metrics")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity analytics")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity scene objects")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity system status")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity signal dock")).toBeInTheDocument();
    expect(screen.queryByText("Credibility loop")).not.toBeInTheDocument();

    // The scene-draft button used to double as the image-tracing trigger, which
    // put fixture geometry on screen for a scene nobody had traced. Tracing
    // geometry now has its own labelled entry.
    fireEvent.click(screen.getByRole("button", { name: "AI 草稿" }));

    expect(screen.queryByLabelText("AI 图层")).not.toBeInTheDocument();
    expect(screen.getByText("请先输入 AI 提示词")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "描图示例" }));

    expect(screen.getByLabelText("AI 图层")).toBeInTheDocument();
    expect(screen.getAllByText(/复核/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("heading", { name: "BioCity Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText(/simulation viewport/i)).toBeInTheDocument();
    const simulationControls = within(screen.getByLabelText("Simulation controls"));
    expect(simulationControls.getByText("Run controls")).toBeInTheDocument();
    expect(simulationControls.getByText("Evacuation")).toBeInTheDocument();
    expect(simulationControls.getByText("Simulation speed")).toBeInTheDocument();
    expect(simulationControls.getByText("Heatmap window")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Live telemetry")).getByText("Kernel"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Live telemetry")).getByText("worker/fallback"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity key metrics")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity analytics")).toBeInTheDocument();
    expect(screen.queryByText("Movement backend")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Network" }));

    expect(
      screen.getByRole("heading", { name: "Crowd Contact Network" }),
    ).toBeInTheDocument();
  });

  it("switches the viewport between 2D and 3D modes", () => {
    renderWorkbench();

    const twoDimensionalButton = screen.getByRole("button", { name: "2D" });
    const threeDimensionalButton = screen.getByRole("button", { name: "3D" });

    expect(twoDimensionalButton).toHaveAttribute("aria-pressed", "false");
    expect(threeDimensionalButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(twoDimensionalButton);

    expect(twoDimensionalButton).toHaveAttribute("aria-pressed", "true");
    expect(threeDimensionalButton).toHaveAttribute("aria-pressed", "false");
    expect(
      within(screen.getByLabelText("视图模式")).getByText("2D 平面"),
    ).toBeInTheDocument();
  });
});
