import { parseScene } from "@crowdsim/scene-schema";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppInspector } from "./AppInspector";
import { I18nProvider, translate } from "./i18n";
import { createRunAnalytics } from "./runAnalytics";
import { createTrajectoryRecording } from "./trajectoryRecording";
import type { SystemSignal } from "./AppTypes";

// The component resolves its own label via `t("movementBackend")`, and the
// default rendered language (no stored preference in jsdom) is "zh" -- so
// the fixture's label must match that translation, not an assumed English
// string, or the "does the row exist" assertion would pass for the wrong
// reason.
const movementBackendLabel = translate("zh", "movementBackend");

afterEach(cleanup);

const scene = parseScene({
  schemaVersion: "1.0.0",
  id: "inspector-test",
  name: "Inspector test",
  world: { width: 40, height: 20 },
});

// ADR-0033 stage 3: the movement backend row is real runtime state -- it must
// be visible in the collapsed "engineering signals" dock even though it does
// not land in the first four entries of `signals` (see AppInspector.tsx's own
// comment on `dockedSignals`).
const signals: SystemSignal[] = [
  { label: "Simulation clock", value: "00:00" },
  { label: "Agents", value: "0" },
  { label: "Spawned", value: "0" },
  { label: "Exited", value: "0" },
  { label: "Speed", value: "1x" },
  { label: "Evacuation", value: "standby" },
  { label: "Scene schema", value: "Inspector test valid" },
  { label: movementBackendLabel, value: "webgpu active @ 60Hz" },
];

function renderInspector(
  overrideSignals: readonly SystemSignal[] = signals,
  overrides: {
    gpuMovementAvailable?: boolean;
    gpuMovementRequested?: boolean;
    onToggleGpuMovement?: () => void;
    // Deliberately still an override, not removed: the "does the toggle
    // ignore this?" test below needs to set it to a state that would have
    // disabled the old (removed) gating logic, to prove it no longer does.
    webGpuSupported?: boolean;
  } = {},
) {
  render(
    <I18nProvider>
      <AppInspector
        dashboardSamples={[]}
        elapsedSeconds={0}
        evacuation={{
          active: false,
          baselineExited: 0,
          curve: [],
          flowPlan: null,
          label: "",
          startedAtSeconds: 0,
        }}
        gpuMovementAvailable={overrides.gpuMovementAvailable ?? true}
        gpuMovementRequested={overrides.gpuMovementRequested ?? false}
        heatmapCells={[]}
        journeyDurations={() => []}
        minuteFlows={() => []}
        onExportRunAnalytics={() => undefined}
        placeOccupancyOverTime={() => []}
        onToggleGpuMovement={overrides.onToggleGpuMovement ?? (() => undefined)}
        runSummary={createRunAnalytics().summary()}
        scene={scene}
        signals={overrideSignals}
        simulationCredibility={{
          constraints: "",
          exportReplay: "",
          metricExplanation: "",
          riskNotes: [],
          runtime: "",
          status: "operational",
        }}
        trajectoryRecording={createTrajectoryRecording({
          id: "rec",
          sceneId: scene.id,
          seed: 1,
        })}
        webGpuProbe={
          overrides.webGpuSupported
            ? {
                input: [],
                message: "",
                output: [],
                status: "ready",
                supported: true,
              }
            : {
                input: [],
                message: "",
                output: [],
                status: "unsupported",
                supported: false,
              }
        }
      />
    </I18nProvider>,
  );
}

describe("AppInspector", () => {
  it("docks the movement backend row in engineering signals even though it is not among the first four signals", () => {
    renderInspector();
    const dock = screen.getByRole("region", { name: /工程状态/ });
    expect(within(dock).getByText(movementBackendLabel)).toBeInTheDocument();
    expect(within(dock).getByText("webgpu active @ 60Hz")).toBeInTheDocument();
  });

  it("does not duplicate the movement backend row when it already lands in the first four signals", () => {
    const reordered: SystemSignal[] = [
      { label: movementBackendLabel, value: "webgpu active @ 60Hz" },
      ...signals.filter((signal) => signal.label !== movementBackendLabel),
    ];
    renderInspector(reordered);
    const dock = screen.getByRole("region", { name: /工程状态/ });
    expect(within(dock).getAllByText(movementBackendLabel)).toHaveLength(1);
  });

  // ADR-0033 stage 3 called for "an explicit, labelled toggle ... in the
  // readiness panel"; these are the decisive checks for that, not just
  // "the button renders" -- each one would fail if the wiring were removed.
  it("disables the toggle when the worker simulation path is not in use (?mainsim)", () => {
    renderInspector(signals, { gpuMovementAvailable: false });
    expect(screen.getByRole("button", { name: /GPU/ })).toBeDisabled();
  });

  it("enables the toggle and calls onToggleGpuMovement when clicked, when the worker path is in use", () => {
    const onToggle = vi.fn();
    renderInspector(signals, {
      gpuMovementAvailable: true,
      onToggleGpuMovement: onToggle,
    });
    const button = screen.getByRole("button", { name: /GPU/ });

    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // A self-review of this change (2026-09-26) found the toggle originally
  // gated on `webGpuProbe.supported` instead -- a *different* probe than
  // the one the worker actually uses to acquire its GPU device (the probe
  // requests no `requiredLimits`; the worker's real request needs
  // `maxStorageBuffersPerShaderStage: 16`), which could disable-or-not
  // disagree with what the worker would really do. Removed rather than
  // reconciled (see AppInspector.tsx's own comment): this is the decisive
  // proof that a hostile `webGpuProbe` state (unsupported) no longer
  // disables the button when the worker path is otherwise available.
  it("stays enabled regardless of webGpuProbe's state, when the worker path is available", () => {
    renderInspector(signals, { gpuMovementAvailable: true, webGpuSupported: false });
    expect(screen.getByRole("button", { name: /GPU/ })).toBeEnabled();
  });

  it("labels the toggle by its actual requested state, not a fixed caption", () => {
    renderInspector(signals, { gpuMovementRequested: false });
    expect(screen.getByRole("button", { name: /CPU 默认/ })).toBeInTheDocument();
    cleanup();
    renderInspector(signals, { gpuMovementRequested: true });
    expect(screen.getByRole("button", { name: /已请求/ })).toBeInTheDocument();
  });
});
