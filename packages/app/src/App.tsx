import { useEffect, useMemo, useRef, useState } from "react";
import { AppHome } from "./AppHome";
import { AppInspector } from "./AppInspector";
import { AppSidebar } from "./AppSidebar";
import { AppStage } from "./AppStage";
import type { EvacuationState, StageViewMode } from "./AppTypes";
import { createSystemSignals } from "./appSignals";
import { createDashboardStats, type DashboardSample } from "./dashboardStats";
import { createDashboardV2Stats } from "./dashboardV2Stats";
import { demoScene } from "./demoScene";
import { createEvacuationFlowPlan } from "./evacuationPlan";
import { createHeatmapCellsFromSamples, type HeatmapSample } from "./heatmap";
import { I18nProvider, useI18n } from "./i18n";
import { useAppProbes } from "./useAppProbes";
import { useSimulationController } from "./useSimulationController";
import { useWasmDecisionRuntime } from "./wasmDecisionRuntime";
import { createSimulationCredibilityReport } from "./simulationCredibility";

export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { language, setLanguage, t } = useI18n();
  const probes = useAppProbes();
  const simulation = useSimulationController(demoScene);
  const wasmDecisionRuntime = useWasmDecisionRuntime(simulation.snapshot.stepCount);
  const simulationSnapshotRef = useRef(simulation.snapshot);
  const [dashboardSamples, setDashboardSamples] = useState<DashboardSample[]>([
    {
      agentCount: simulation.snapshot.agentCount,
      elapsedSeconds: simulation.snapshot.elapsedSeconds,
      exitedCount: simulation.snapshot.exitedCount,
    },
  ]);
  const [heatmapSamples, setHeatmapSamples] = useState<HeatmapSample[]>([]);
  const [heatmapWindowSeconds, setHeatmapWindowSeconds] = useState(30);
  const [showHome, setShowHome] = useState(true);
  const [viewMode, setViewMode] = useState<StageViewMode>("2d");
  const [evacuation, setEvacuation] = useState<EvacuationState>({
    active: false,
    baselineExited: 0,
    curve: [],
    flowPlan: null,
    label: "Normal",
    startedAtSeconds: 0,
  });
  const heatmapCells = useMemo(
    () =>
      createHeatmapCellsFromSamples(demoScene, heatmapSamples, {
        cellSize: 4,
        windowSeconds: heatmapWindowSeconds,
      }),
    [heatmapSamples, heatmapWindowSeconds],
  );
  const densityPeak = useMemo(
    () => heatmapCells.reduce((peak, cell) => Math.max(peak, cell.count), 0),
    [heatmapCells],
  );
  const dashboardStats = useMemo(
    () =>
      createDashboardStats({
        densityPeak,
        evacuationActive: evacuation.active,
        evacuationCurve: evacuation.curve,
        samples: dashboardSamples,
      }),
    [dashboardSamples, densityPeak, evacuation.active, evacuation.curve],
  );
  const dashboardV2Stats = useMemo(
    () =>
      createDashboardV2Stats({
        brandInsight:
          probes.shopDecisionProbe.status === "ready"
            ? probes.shopDecisionProbe.brandInsight
            : undefined,
        heatmapSamples,
        queueThroughput:
          probes.queueSystemProbe.status === "ready"
            ? probes.queueSystemProbe.throughput
            : 0,
        samples: dashboardSamples,
        shopDecisionSummary:
          probes.shopDecisionProbe.status === "ready"
            ? probes.shopDecisionProbe.browserSummary
            : "",
      }),
    [
      dashboardSamples,
      heatmapSamples,
      probes.queueSystemProbe.status,
      probes.shopDecisionProbe,
      probes.queueSystemProbe.throughput,
    ],
  );
  const simulationCredibility = useMemo(
    () =>
      createSimulationCredibilityReport({
        dashboardStats,
        evacuation,
        heatmapSamples,
        scene: demoScene,
        simulationSnapshot: simulation.snapshot,
      }),
    [dashboardStats, evacuation, heatmapSamples, simulation.snapshot],
  );

  useEffect(() => {
    simulationSnapshotRef.current = simulation.snapshot;
  }, [simulation.snapshot]);

  useEffect(() => {
    if (!evacuation.active) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setEvacuation((current) => {
        if (!current.active) {
          return current;
        }

        const snapshot = simulationSnapshotRef.current;
        const point = {
          elapsedSeconds: snapshot.elapsedSeconds - current.startedAtSeconds,
          exited: snapshot.exitedCount - current.baselineExited,
          remaining: snapshot.agentCount,
        };
        const lastPoint = current.curve.at(-1);

        if (
          lastPoint &&
          Math.floor(lastPoint.elapsedSeconds) === Math.floor(point.elapsedSeconds)
        ) {
          return current;
        }

        return {
          ...current,
          curve: [...current.curve, point].slice(-20),
        };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [evacuation.active]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const snapshot = simulationSnapshotRef.current;

      if (snapshot.status !== "running") {
        return;
      }

      setHeatmapSamples((samples) => {
        const lastSample = samples.at(-1);

        if (
          lastSample &&
          Math.floor(lastSample.elapsedSeconds) === Math.floor(snapshot.elapsedSeconds)
        ) {
          return samples;
        }

        return [
          ...samples,
          {
            agents: snapshot.agents.map((agent) => ({
              id: agent.id,
              x: agent.x,
              y: agent.y,
            })),
            elapsedSeconds: snapshot.elapsedSeconds,
          },
        ].slice(-120);
      });

      setDashboardSamples((samples) => {
        const lastSample = samples.at(-1);

        if (
          lastSample &&
          Math.floor(lastSample.elapsedSeconds) === Math.floor(snapshot.elapsedSeconds)
        ) {
          return samples;
        }

        return [
          ...samples,
          {
            agentCount: snapshot.agentCount,
            elapsedSeconds: snapshot.elapsedSeconds,
            exitedCount: snapshot.exitedCount,
          },
        ].slice(-120);
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  function resetSimulation() {
    simulation.reset();
    setDashboardSamples([
      {
        agentCount: 0,
        elapsedSeconds: 0,
        exitedCount: 0,
      },
    ]);
    setHeatmapSamples([]);
  }

  async function triggerEvacuation() {
    const behaviorMode = await wasmDecisionRuntime.triggerEvacuation();
    const snapshot = simulation.snapshot;
    const flowPlan = createEvacuationFlowPlan(demoScene, snapshot.agents);

    simulation.start();
    setEvacuation({
      active: behaviorMode.active,
      baselineExited: snapshot.exitedCount,
      curve: [
        {
          elapsedSeconds: 0,
          exited: 0,
          remaining: snapshot.agentCount,
        },
      ],
      flowPlan,
      label: behaviorMode.label,
      startedAtSeconds: snapshot.elapsedSeconds,
    });
  }

  async function clearEvacuation() {
    const behaviorMode = await wasmDecisionRuntime.reset();

    setEvacuation({
      active: behaviorMode.active,
      baselineExited: simulation.snapshot.exitedCount,
      curve: [],
      flowPlan: null,
      label: behaviorMode.label,
      startedAtSeconds: simulation.snapshot.elapsedSeconds,
    });
  }

  const heatmapValue =
    heatmapCells.length > 0
      ? `${heatmapCells.length} ${t("cells")} / ${heatmapWindowSeconds}s`
      : t("noSamples");
  const signals = createSystemSignals({
    agentStateProbe: probes.agentStateProbe,
    behaviorSmokeValue: probes.behaviorSmokeValue,
    discreteEventProbe: probes.discreteEventProbe,
    evacuation,
    flowFieldProbe: probes.flowFieldProbe,
    gridProbe: probes.gridProbe,
    heatmapProbe: probes.heatmapProbe,
    heatmapValue,
    language,
    movementBackendProbe: probes.movementBackendProbe,
    queueSystemProbe: probes.queueSystemProbe,
    scene: demoScene,
    sharedArrayBufferProbe: probes.sharedArrayBufferProbe,
    shopDecisionProbe: probes.shopDecisionProbe,
    simulationSnapshot: simulation.snapshot,
    socialForceProbe: probes.socialForceProbe,
    t,
    viewMode,
    wasmDecisionRuntime,
    webGpuProbe: probes.webGpuProbe,
  });
  const labTitle = language === "zh" ? "商业客流运营台" : "Commercial crowd console";
  const runState =
    simulation.snapshot.status === "running" ? t("running") : t("paused");
  const displayLabTitle = language === "zh" ? "商业客流运营台" : labTitle;

  function enterLab(nextViewMode: StageViewMode = viewMode) {
    setViewMode(nextViewMode);
    setShowHome(false);
  }

  if (showHome) {
    return (
      <AppHome
        language={language}
        onEnterLab={() => enterLab()}
        onOpenNetwork={() => enterLab("network")}
        onSetLanguage={setLanguage}
        runState={runState}
        webGpuStatus={probes.webGpuProbe.status}
      />
    );
  }

  return (
    <main className="workspace">
      <header className="command-bar" aria-label={displayLabTitle}>
        <div className="command-brand">
          <span>CrowdSim</span>
          <strong>{displayLabTitle}</strong>
          <button
            type="button"
            className="command-home"
            onClick={() => setShowHome(true)}
          >
            {language === "zh" ? "首页" : "Home"}
          </button>
        </div>
        <div className="command-status" aria-label={t("systemSignals")}>
          <span data-state={simulation.snapshot.status}>{runState}</span>
          <span>WebGPU {probes.webGpuProbe.status}</span>
          <span>{language === "zh" ? "品牌模型" : "Brand model"}</span>
          <span>{language === "zh" ? "证据层" : "Evidence"}</span>
          <span>{language === "zh" ? "验证通过" : "Verified"}</span>
        </div>
      </header>
      <AppSidebar
        heatmapWindowSeconds={heatmapWindowSeconds}
        language={language}
        onClearEvacuation={() => void clearEvacuation()}
        onEvacuate={() => void triggerEvacuation()}
        onHeatmapWindowChange={setHeatmapWindowSeconds}
        onPause={simulation.pause}
        onReset={resetSimulation}
        onSetLanguage={setLanguage}
        onSetTimeScale={simulation.setTimeScale}
        onStart={simulation.start}
        simulationStatus={simulation.snapshot.status}
        t={t}
        timeScale={simulation.snapshot.timeScale}
      />
      <AppStage
        heatmapCells={heatmapCells}
        language={language}
        onViewModeChange={setViewMode}
        scene={demoScene}
        simulationSnapshot={simulation.snapshot}
        t={t}
        viewMode={viewMode}
      />
      <AppInspector
        agentStateProbe={probes.agentStateProbe}
        dashboardStats={dashboardStats}
        dashboardV2Stats={dashboardV2Stats}
        discreteEventProbe={probes.discreteEventProbe}
        evacuation={evacuation}
        flowFieldProbe={probes.flowFieldProbe}
        gridProbe={probes.gridProbe}
        heatmapProbe={probes.heatmapProbe}
        queueSystemProbe={probes.queueSystemProbe}
        shopDecisionProbe={probes.shopDecisionProbe}
        signals={signals}
        simulationCredibility={simulationCredibility}
        socialForceProbe={probes.socialForceProbe}
        webGpuProbe={probes.webGpuProbe}
      />
    </main>
  );
}
