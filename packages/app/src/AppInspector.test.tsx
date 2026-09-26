import { parseScene } from "@crowdsim/scene-schema";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

function renderInspector(overrideSignals: readonly SystemSignal[] = signals) {
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
        heatmapCells={[]}
        journeyDurations={() => []}
        minuteFlows={() => []}
        onExportRunAnalytics={() => undefined}
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
        webGpuProbe={{
          input: [],
          message: "",
          output: [],
          status: "unsupported",
          supported: false,
        }}
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
});
