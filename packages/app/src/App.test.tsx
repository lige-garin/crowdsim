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

describe("App", () => {
  it("starts from the BioCity studio and can return home", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "BioCity Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity operating status")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity simulation timeline")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "首页" }));

    expect(
      screen.getByRole("heading", { name: "CrowdSim Operations" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    fireEvent.click(screen.getByRole("button", { name: "View network" }));

    expect(
      screen.getByRole("heading", { name: "Contact Network" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    expect(
      screen.getByRole("heading", { name: "CrowdSim Operations" }),
    ).toBeInTheDocument();
  });

  it("renders the bilingual control room shell", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "BioCity Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity operating status")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity planning toolbox")).toBeInTheDocument();
    expect(screen.getByLabelText("BioCity simulation timeline")).toBeInTheDocument();
    expect(screen.getByText("T0.1")).toBeInTheDocument();
    expect(screen.getByLabelText("仿真视口")).toBeInTheDocument();
    expect(screen.getByText("BioCity Rainy High Street 有效")).toBeInTheDocument();
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(await screen.findByText("状态机已验证")).toBeInTheDocument();
    expect(await screen.findByText("DES 队列已验证")).toBeInTheDocument();
    expect(await screen.findByText("商铺决策已验证")).toBeInTheDocument();
    expect(await screen.findByText("队列系统已验证")).toBeInTheDocument();
    expect(await screen.findByText("2, 4, 6, 8")).toBeInTheDocument();
    expect(await screen.findByText(/sorted 0, 2, 1, 3/)).toBeInTheDocument();
    expect(await screen.findByText("社会力已验证")).toBeInTheDocument();
    expect(await screen.findByText("流场已验证")).toBeInTheDocument();
    expect(await screen.findByText("热力图密度已验证")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI 草稿" }));

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
    expect(await screen.findByText("100,000 visual agents")).toBeInTheDocument();
    expect(await screen.findByText("WebGPU render benchmark")).toBeInTheDocument();
    expect(screen.getByText("Movement backend")).toBeInTheDocument();
    expect(screen.getByText("cpu-compat active @ 60Hz")).toBeInTheDocument();
    expect(screen.getByText("WebGPU movement")).toBeInTheDocument();
    expect(screen.getByText("webgpu-ready verified")).toBeInTheDocument();
    expect(screen.getByText("Decision backend")).toBeInTheDocument();
    expect(await screen.findByText("wasm-ready @ 10Hz")).toBeInTheDocument();
    expect(screen.getByText("Decision ticks")).toBeInTheDocument();
    expect(screen.getByText("Shared memory")).toBeInTheDocument();
    expect(screen.getByText("SAB ready | isolated | 16 bytes")).toBeInTheDocument();
    expect(screen.getByText("Simulation agent limit")).toBeInTheDocument();
    expect(screen.getByText("2,000")).toBeInTheDocument();
    expect(screen.getByText("Credibility loop")).toBeInTheDocument();
    expect(screen.getByText(/scene=biocity-rainy-high-street/)).toBeInTheDocument();
    expect(screen.getByText(/packedReplay=v1 ready/)).toBeInTheDocument();
    expect(screen.getByText("BioCity Rainy High Street valid")).toBeInTheDocument();
    expect(await screen.findByText("Agent state machine verified")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Network" }));

    expect(
      screen.getByRole("heading", { name: "Contact Network" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dr. Chen")).toBeInTheDocument();
  });

  it("switches the viewport between 2D and 3D modes", () => {
    render(<App />);

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
