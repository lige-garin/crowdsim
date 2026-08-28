import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHome } from "./AppHome";
import { AppWorkbench } from "./AppWorkbench";
import type { EvacuationState, StageViewMode } from "./AppTypes";
import { createSystemSignals } from "./appSignals";
import { createBioCityTopbarMetrics } from "./appTopbarMetrics";
import { createDashboardStats, type DashboardSample } from "./dashboardStats";
import { createDashboardV2Stats } from "./dashboardV2Stats";
import { bioCityDemoScene as initialScene } from "./bioCityDemoScene";
import { createEvacuationFlowPlan } from "./evacuationPlan";
import { createHeatmapCellsFromSamples, type HeatmapSample } from "./heatmap";
import { formatSceneName, I18nProvider, useI18n } from "./i18n";
import { createSimulationCredibilityReport } from "./simulationCredibility";
import { createLiveSimulationRuntimeArtifact } from "./simulationRuntimeArtifact";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
} from "./trajectoryRecording";
import { useAppProbes } from "./useAppProbes";
import { useSimulationController } from "./useSimulationController";
import { useSimulationWorkerController } from "./useSimulationWorkerController";
import { useWebGpuMovementBackend } from "./useWebGpuMovementBackend";
import { usesWorkerSimulationPath } from "./simulationThread";
import { useWasmDecisionRuntime } from "./wasmDecisionRuntime";
import type { EditorTool } from "./sceneEditorState";
import {
  defaultViewportLayers,
  toggleViewportLayer,
  type ViewportLayerId,
} from "./viewportLayers";
export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
type RuntimeArtifact = ReturnType<typeof createLiveSimulationRuntimeArtifact>;
function sameRuntime(left: RuntimeArtifact, right: RuntimeArtifact) {
  return (
    left.decisionBackend === right.decisionBackend &&
    left.decisionHz === right.decisionHz &&
    left.movementBackend === right.movementBackend &&
    left.movementHz === right.movementHz &&
    left.sharedMemory === right.sharedMemory &&
    left.thread === right.thread
  );
}
function AppContent() {
  const { language, setLanguage, t } = useI18n();
  // The live scene is shell state, not a module constant. The editor hands its
  // working copy back through `applyScene`, and swapping this value is what
  // re-inits both simulation paths with the new geometry — this is the
  // editor -> simulation loop that used to be hard-wired to the demo scene.
  const [scene, setScene] = useState(initialScene);
  const probes = useAppProbes();
  const webGpuMovementBackend = useWebGpuMovementBackend();
  const mainThreadSimulation = useSimulationController(scene, {
    // Default to the engine's mall-crowd decision backend so agents shop with a
    // reason; the wasm DES backend stays available for other scenarios.
    movementBackend: webGpuMovementBackend.backend,
  });
  const workerSimulation = useSimulationWorkerController(scene);
  // `?mainsim` forces the main-thread CPU simulation. It is the working path
  // when there is no WebGPU (otherwise the app falls back to the worker path)
  // and is also what headless visual testing uses to render a live crowd.
  const forceMainSim =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mainsim");
  // Pick the simulation path from the stable ?mainsim flag only, never from the
  // async WebGPU probe. Gating on webGpuMovementBackend.backend flipped the path
  // worker -> main the moment the probe resolved, abandoning the running worker
  // sim for a never-started main engine: the "empty city" bug on WebGPU machines.
  const usesWorkerSimulation = usesWorkerSimulationPath({ forceMainSim });
  const simulation = usesWorkerSimulation ? workerSimulation : mainThreadSimulation;
  const currentRuntime = useMemo(
    () =>
      createLiveSimulationRuntimeArtifact({
        movementBackend: webGpuMovementBackend.backend?.id ?? "cpu-compat",
        sharedMemory: workerSimulation.worker.sharedMemory ? "sab" : "fallback",
        thread: usesWorkerSimulation ? "worker" : "main",
      }),
    [
      usesWorkerSimulation,
      webGpuMovementBackend.backend?.id,
      workerSimulation.worker.sharedMemory,
    ],
  );
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
  const [trajectoryRecording, setTrajectoryRecording] = useState(() =>
    createTrajectoryRecording({
      id: "live-recording",
      runtime: currentRuntime,
      sceneId: scene.id,
      seed: scene.seed,
    }),
  );
  const [heatmapWindowSeconds, setHeatmapWindowSeconds] = useState(30);
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [layers, setLayers] = useState(defaultViewportLayers);
  const [showHome, setShowHome] = useState(true);
  const [viewMode, setViewMode] = useState<StageViewMode>("3d");
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
      createHeatmapCellsFromSamples(scene, heatmapSamples, {
        cellSize: 4,
        windowSeconds: heatmapWindowSeconds,
      }),
    [heatmapSamples, heatmapWindowSeconds, scene],
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
      probes.queueSystemProbe.throughput,
      probes.shopDecisionProbe,
    ],
  );
  const simulationCredibility = useMemo(
    () =>
      createSimulationCredibilityReport({
        dashboardStats,
        evacuation,
        heatmapSamples,
        runtime: currentRuntime,
        scene: scene,
        simulationSnapshot: simulation.snapshot,
      }),
    [
      currentRuntime,
      dashboardStats,
      evacuation,
      heatmapSamples,
      scene,
      simulation.snapshot,
    ],
  );
  useEffect(() => {
    simulationSnapshotRef.current = simulation.snapshot;
  }, [simulation.snapshot]);
  // Auto-start the demo so opening the workbench shows a live crowd instead of
  // an empty city. Retries until the worker is ready, runs once, and never
  // fights a manual pause.
  const autoStartedRef = useRef(false);
  const startSimulation = simulation.start;
  const simulationStatus = simulation.snapshot.status;
  useEffect(() => {
    if (autoStartedRef.current) {
      return;
    }
    if (simulationStatus === "running") {
      autoStartedRef.current = true;
      return;
    }
    const intervalId = window.setInterval(() => startSimulation(), 400);
    return () => window.clearInterval(intervalId);
  }, [simulationStatus, startSimulation]);
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
      setTrajectoryRecording((recording) =>
        appendTrajectoryFrame(
          sameRuntime(recording.runtime, currentRuntime)
            ? recording
            : createTrajectoryRecording({
                id: "live-recording",
                runtime: currentRuntime,
                sceneId: scene.id,
                seed: scene.seed,
              }),
          snapshot,
        ),
      );
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [currentRuntime, scene.id, scene.seed]);
  function applyScene(nextScene: CrowdSimScene) {
    // Swapping the scene re-inits whichever simulation path is mounted: the
    // worker controller rebuilds its client on `[scene]`, the main-thread
    // controller rebuilds its engine. Clear the series that describe the OLD
    // scene so charts never mix two geometries.
    setScene(nextScene);
    setDashboardSamples([
      { agentCount: 0, elapsedSeconds: 0, exitedCount: 0 },
    ]);
    setHeatmapSamples([]);
    setTrajectoryRecording(
      createTrajectoryRecording({
        id: "live-recording",
        runtime: currentRuntime,
        sceneId: nextScene.id,
        seed: nextScene.seed,
      }),
    );
  }
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
    setTrajectoryRecording(
      createTrajectoryRecording({
        id: "live-recording",
        runtime: currentRuntime,
        sceneId: scene.id,
        seed: scene.seed,
      }),
    );
  }
  async function triggerEvacuation() {
    const behaviorMode = await wasmDecisionRuntime.triggerEvacuation();
    const snapshot = simulation.snapshot;
    const flowPlan = createEvacuationFlowPlan(scene, snapshot.agents);
    simulation.setEvacuation(true);
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
    simulation.setEvacuation(false);
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
    movementBackend: webGpuMovementBackend.backend?.id ?? "cpu-compat",
    movementBackendProbe: probes.movementBackendProbe,
    queueSystemProbe: probes.queueSystemProbe,
    scene: scene,
    sharedArrayBufferProbe: probes.sharedArrayBufferProbe,
    shopDecisionProbe: probes.shopDecisionProbe,
    simulationSnapshot: simulation.snapshot,
    socialForceProbe: probes.socialForceProbe,
    t,
    viewMode,
    wasmDecisionRuntime,
    webGpuProbe: probes.webGpuProbe,
    workerRuntime:
      simulation === workerSimulation
        ? workerSimulation.worker
        : {
            message: "Main thread GPU movement active",
            mode: "inline",
            sharedMemory: false,
            status: "ready",
          },
  });
  const runState =
    simulation.snapshot.status === "running" ? t("running") : t("paused");
  // Heuristic estimates, NOT measured (SP-5b honesty), but grounded in the real
  const bioCityTopbarMetrics = createBioCityTopbarMetrics({
    brandAttractionPercent: dashboardV2Stats.brandAttractionPercent,
    densityPeak,
    evacuationActive: evacuation.active,
    language,
    runState,
    runtime: currentRuntime,
    scene: scene,
    snapshot: simulation.snapshot,
  });
  function enterLab(nextViewMode: StageViewMode = viewMode) {
    setViewMode(nextViewMode);
    setShowHome(false);
  }
  if (showHome) {
    return (
      <>
        <a className="skip-link" href="#main-content">
          {language === "zh" ? "跳到主内容" : "Skip to main content"}
        </a>
        <AppHome
          language={language}
          onEnterLab={() => enterLab()}
          onOpenNetwork={() => enterLab("network")}
          onSetLanguage={setLanguage}
          runState={runState}
          webGpuStatus={probes.webGpuProbe.status}
        />
      </>
    );
  }
  return (
    <>
      <a className="skip-link" href="#main-content">
        {language === "zh" ? "跳到主内容" : "Skip to main content"}
      </a>
      <div id="main-content">
        <AppWorkbench
          inspectorProps={{
            agentStateProbe: probes.agentStateProbe,
            dashboardStats,
            dashboardV2Stats,
            discreteEventProbe: probes.discreteEventProbe,
            elapsedSeconds: simulation.snapshot.elapsedSeconds,
            evacuation,
            flowFieldProbe: probes.flowFieldProbe,
            gridProbe: probes.gridProbe,
            heatmapCells,
            heatmapProbe: probes.heatmapProbe,
            queueSystemProbe: probes.queueSystemProbe,
            scene: scene,
            shopDecisionProbe: probes.shopDecisionProbe,
            signals,
            simulationCredibility,
            socialForceProbe: probes.socialForceProbe,
            trajectoryRecording,
            webGpuProbe: probes.webGpuProbe,
          }}
          language={language}
          onHome={() => setShowHome(true)}
          panelDockProps={{
            context: {
              brandInsight:
                probes.shopDecisionProbe.status === "ready"
                  ? probes.shopDecisionProbe.brandInsight
                  : undefined,
              trajectoryRecording,
            },
            language,
          }}
          runState={runState}
          runtime={currentRuntime}
          sceneName={formatSceneName(scene, language)}
          sidebarProps={{
            agentCount: simulation.snapshot.agentCount,
            editorTool,
            exitedCount: simulation.snapshot.exitedCount,
            heatmapWindowSeconds,
            language,
            layers,
            onClearEvacuation: () => void clearEvacuation(),
            onEditorToolChange: setEditorTool,
            onEvacuate: () => void triggerEvacuation(),
            onHeatmapWindowChange: setHeatmapWindowSeconds,
            onPause: simulation.pause,
            onReset: resetSimulation,
            onSetLanguage: setLanguage,
            onSetTimeScale: simulation.setTimeScale,
            onStart: simulation.start,
            onToggleLayer: (layer: ViewportLayerId) =>
              setLayers((current) => toggleViewportLayer(current, layer)),
            simulationStatus: simulation.snapshot.status,
            spawnedCount: simulation.snapshot.spawnedCount,
            t,
            timeScale: simulation.snapshot.timeScale,
          }}
          simulationStatus={simulation.snapshot.status}
          stageProps={{
            editorTool,
            heatmapCells,
            language,
            layers,
            onApplyScene: applyScene,
            onEditorToolChange: setEditorTool,
            onViewModeChange: setViewMode,
            runtime: currentRuntime,
            scene: scene,
            sharedAgentOverlay:
              simulation === workerSimulation
                ? workerSimulation.worker.sharedAgentOverlay
                : undefined,
            simulationSnapshot: simulation.snapshot,
            t,
            viewMode,
          }}
          t={t}
          topbarMetrics={bioCityTopbarMetrics}
          webGpuStatus={probes.webGpuProbe.status}
        />
      </div>
    </>
  );
}
