import { sceneFloors, sceneOnFloor, type CrowdSimScene } from "@crowdsim/scene-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHome } from "./AppHome";
import { AppWorkbench } from "./AppWorkbench";
import type { EvacuationState, StageTab, StageViewMode } from "./AppTypes";
import { createSystemSignals } from "./appSignals";
import { createHudReadouts } from "./appTopbarMetrics";
import { createDashboardStats } from "./dashboardStats";
import { defaultDemoScene as initialScene } from "./defaultDemoScene";
import { createEvacuationFlowPlan } from "./evacuationPlan";
import { createHeatmapCellsFromSamples, heatmapSamplesOnFloor } from "./heatmap";
import { formatSceneName, I18nProvider, useI18n } from "./i18n";
import { UiModeProvider, useUiMode } from "./uiMode";
import { createSimulationCredibilityReport } from "./simulationCredibility";
import { createLiveSimulationRuntimeArtifact } from "./simulationRuntimeArtifact";
import { useAppProbes } from "./useAppProbes";
import { useSimulationController } from "./useSimulationController";
import { useSimulationWorkerController } from "./useSimulationWorkerController";
import { usesWorkerSimulationPath } from "./simulationThread";
import { useWasmDecisionRuntime } from "./wasmDecisionRuntime";
import type { EditorTool } from "./sceneEditorState";
import { placesInWorld } from "./renderer/worldPlacement";
import { useWorldBuilding } from "./useWorldBuilding";
import { hotUpdateBlocker } from "./simulationEngine";
import { createLiveCrowd } from "./liveCrowd";
import { downloadCsv } from "./runAnalytics";
import { useRunSeries } from "./useRunSeries";
import { trajectoryCsv } from "./trajectoryRecording";
import type { RunAnalyticsExport } from "./RunAnalyticsPanel";
import {
  defaultViewportLayers,
  toggleViewportLayer,
  type ViewportLayerId,
} from "./viewportLayers";
export function App() {
  return (
    <I18nProvider>
      <UiModeProvider>
        <AppContent />
      </UiModeProvider>
    </I18nProvider>
  );
}
function AppContent() {
  const { language, setLanguage, t } = useI18n();
  const { uiMode, toggleUiMode } = useUiMode();
  // The live scene is shell state, not a module constant. The editor hands its
  // working copy back through `applyScene`, and swapping this value is what
  // puts the new geometry into both simulation paths (hot when the world and
  // seed are unchanged, a re-init otherwise; ADR-0007) — this is the
  // editor -> simulation loop that used to be hard-wired to the demo scene.
  const [scene, setScene] = useState(initialScene);
  const probes = useAppProbes();
  // Both paths run the same CPU social-force model. The main-thread path used
  // to hand movement to a separate WebGPU backend (its own GPU device, an
  // O(N²) shader, no notion of browsing or queuing), so `?mainsim` simulated a
  // different crowd from the default worker path.
  const mainThreadSimulation = useSimulationController(scene, {});
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
  const sharedAgentOverlay =
    simulation === workerSimulation
      ? workerSimulation.worker.sharedAgentOverlay
      : undefined;
  // The crowd reaches the views through this store, not as props (see liveCrowd).
  const [liveCrowd] = useState(() =>
    createLiveCrowd({ snapshot: simulation.snapshot }),
  );
  // While replaying, the replay bar feeds the store from the recording instead.
  const [replaying, setReplaying] = useState(false);
  useEffect(() => {
    if (!replaying)
      liveCrowd.set({ sharedAgentOverlay, snapshot: simulation.snapshot });
  }, [liveCrowd, replaying, sharedAgentOverlay, simulation.snapshot]);
  const currentRuntime = useMemo(
    () =>
      createLiveSimulationRuntimeArtifact({
        movementBackend: "cpu-compat",
        sharedMemory: workerSimulation.worker.sharedMemory ? "sab" : "fallback",
        thread: usesWorkerSimulation ? "worker" : "main",
      }),
    [usesWorkerSimulation, workerSimulation.worker.sharedMemory],
  );
  const wasmDecisionRuntime = useWasmDecisionRuntime(simulation.snapshot.stepCount);
  const simulationSnapshotRef = useRef(simulation.snapshot);
  const runSeries = useRunSeries({
    runtime: currentRuntime,
    scene,
    snapshot: simulation.snapshot,
  });
  const {
    dashboardSamples,
    heatmapSamples,
    journeyDurations,
    minuteFlows,
    runSummary,
    trajectoryRecording,
  } = runSeries;
  const [heatmapWindowSeconds, setHeatmapWindowSeconds] = useState(30);
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [stageTab, setStageTab] = useState<StageTab>("run");
  const [layers, setLayers] = useState(defaultViewportLayers);
  const [showHome, setShowHome] = useState(true);
  const [viewMode, setViewMode] = useState<StageViewMode>("3d");
  // Picking a tool is a request to build. In the 3D city it builds right there
  // under the cursor; tools the world cannot place yet (a multi-click wall), and
  // the flat views, open the 2D editor instead of leaving the tool dead.
  function selectEditorTool(tool: EditorTool) {
    setEditorTool(tool);
    const inWorld = stageTab === "run" && viewMode === "3d" && placesInWorld(tool);
    if (tool !== "select" && !inWorld) {
      setStageTab("edit");
    }
  }
  // Going to a view is also a statement about the tool in your hand: a held
  // tool the destination cannot use (any tool on the 2D or network view, a
  // multi-click wall in 3D) is dropped rather than left lit and dead, where a
  // click silently did nothing.
  function showView(nextViewMode: StageViewMode) {
    setStageTab("run");
    setViewMode(nextViewMode);
    if (!(nextViewMode === "3d" && placesInWorld(editorTool))) {
      setEditorTool("select");
    }
  }
  const [evacuation, setEvacuation] = useState<EvacuationState>({
    active: false,
    baselineExited: 0,
    curve: [],
    flowPlan: null,
    label: "Normal",
    startedAtSeconds: 0,
  });
  const floors = useMemo(() => sceneFloors(scene), [scene]);
  const [watchedFloorId, setWatchedFloorId] = useState<string | undefined>(undefined);
  // Falls back to the ground floor whenever the scene has no such floor: a
  // scene swap or an edit can remove the one being watched.
  const watchedIndex = floors.findIndex((floor) => floor.id === watchedFloorId);
  const viewFloorIndex = floors.length === 0 ? -1 : Math.max(0, watchedIndex);
  const viewFloorId = floors[viewFloorIndex]?.id;
  const viewFloor = useMemo(
    () => (viewFloorId ? { id: viewFloorId, index: viewFloorIndex } : undefined),
    [viewFloorId, viewFloorIndex],
  );
  const viewScene = useMemo(
    () => (viewFloorId ? (sceneOnFloor(scene, viewFloorId) ?? scene) : scene),
    [scene, viewFloorId],
  );
  const floorHeatmapSamples = useMemo(
    () => heatmapSamplesOnFloor(heatmapSamples, viewFloorId),
    [heatmapSamples, viewFloorId],
  );
  const heatmapCells = useMemo(
    () =>
      // 2 m cells: the grid Fruin level of service is read on (runAnalytics).
      createHeatmapCellsFromSamples(viewScene, floorHeatmapSamples, {
        cellSize: 2,
        windowSeconds: heatmapWindowSeconds,
      }),
    [floorHeatmapSamples, heatmapWindowSeconds, viewScene],
  );
  /**
   * The busiest cell in the building, not in the view.
   *
   * The heatmap beside it is one floor's plan, so its cells are that floor's.
   * Deriving the KPI from them made "peak density" change every time someone
   * clicked a floor button, next to an agent count that stayed whole-building.
   * Each floor is counted on its own grid — adding the floors together would
   * report a crowd standing where nobody is (ADR-0010).
   */
  const densityPeak = useMemo(() => {
    // With one floor the heatmap beside it already is the whole building, so
    // read the peak off it rather than gridding the same samples again on
    // every render — which was slow enough to time the panel tests out.
    if (floors.length === 0) {
      return heatmapCells.reduce((peak, cell) => Math.max(peak, cell.count), 0);
    }

    return floors.reduce((peak, floor) => {
      const cells = createHeatmapCellsFromSamples(
        sceneOnFloor(scene, floor.id) ?? scene,
        heatmapSamplesOnFloor(heatmapSamples, floor.id),
        { cellSize: 2, windowSeconds: heatmapWindowSeconds },
      );

      return cells.reduce((best, cell) => Math.max(best, cell.count), peak);
    }, 0);
  }, [floors, heatmapCells, heatmapSamples, heatmapWindowSeconds, scene]);
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
  // Auto-start so the workbench opens on a live crowd instead of an empty city.
  //
  // The latch is per ENGINE, not per session. Applying an edit swaps the scene,
  // which rebuilds the worker on the new geometry, and a fresh engine starts
  // paused. With a once-per-session latch the run stopped dead at "apply to
  // simulation" and never came back: the city emptied to zero agents and stayed
  // there until the user found the play button. That is the one loop the whole
  // product is built around — edit, apply, watch — so it restarts per engine.
  //
  // A deliberate pause is still respected, which is what the second ref is for:
  // "has an engine been started" and "does the user want it stopped" are two
  // different questions and were previously answered by the same flag.
  const autoStartedRef = useRef(false);
  const userPausedRef = useRef(false);
  const startSimulation = simulation.start;
  const simulationStatus = simulation.snapshot.status;
  useEffect(() => {
    if (autoStartedRef.current || userPausedRef.current) {
      return;
    }
    if (simulationStatus === "running") {
      autoStartedRef.current = true;
      return;
    }
    const intervalId = window.setInterval(() => startSimulation(), 400);
    return () => window.clearInterval(intervalId);
  }, [simulationStatus, startSimulation]);
  function pauseSimulation() {
    userPausedRef.current = true;
    simulation.pause();
  }
  function startSimulationFromControls() {
    userPausedRef.current = false;
    setReplaying(false);
    simulation.start();
  }
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
  function applyScene(nextScene: CrowdSimScene) {
    setScene(nextScene);
    // Same world and seed: the controllers swap the geometry into the running
    // engine (ADR-0007). It is the same run, so its series, recording and
    // auto-start state all carry on.
    if (hotUpdateBlocker(scene, nextScene) === null) return;
    // Otherwise the run is rebuilt from scratch. Clear the series that describe
    // the OLD run so charts never mix two geometries.
    autoStartedRef.current = false;
    setReplaying(false);
    runSeries.clear(nextScene);
  }
  const worldBuilding = useWorldBuilding({
    applyScene,
    enabled: stageTab === "run" && viewMode === "3d",
    onCancelTool: () => setEditorTool("select"),
    scene,
  });
  function resetSimulation() {
    autoStartedRef.current = false;
    simulation.reset();
    // The engine's reset ends an evacuation; the shell's record of it must end
    // with it, or the hazard key stays pressed and the evacuation curve keeps
    // appending points measured against a baseline from before the reset.
    void wasmDecisionRuntime.reset().then((behaviorMode) =>
      setEvacuation({
        active: behaviorMode.active,
        baselineExited: 0,
        curve: [],
        flowPlan: null,
        label: behaviorMode.label,
        startedAtSeconds: 0,
      }),
    );
    setReplaying(false);
    runSeries.clear(scene);
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
    movementBackend: "cpu-compat",
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
            message: "Main-thread CPU simulation (?mainsim)",
            mode: "inline",
            sharedMemory: false,
            status: "ready",
          },
  });
  const runState =
    simulation.snapshot.status === "running" ? t("running") : t("paused");
  const hudReadouts = createHudReadouts({
    language,
    scene,
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
          onSelectTemplate={(templateScene) => {
            applyScene(templateScene);
            enterLab();
          }}
          onSetLanguage={setLanguage}
          onToggleUiMode={toggleUiMode}
          runState={runState}
          uiMode={uiMode}
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
          controls={{
            agentCount: simulation.snapshot.agentCount,
            canUndoBuild: worldBuilding.canUndo,
            editorTool,
            evacuationActive: evacuation.active,
            exitedCount: simulation.snapshot.exitedCount,
            heatmapWindowSeconds,
            layers,
            onClearEvacuation: () => void clearEvacuation(),
            onEditorToolChange: selectEditorTool,
            onEvacuate: () => void triggerEvacuation(),
            onHeatmapWindowChange: setHeatmapWindowSeconds,
            onPause: pauseSimulation,
            onReplay:
              trajectoryRecording.frames.length > 1
                ? () => {
                    pauseSimulation();
                    setReplaying(!replaying);
                  }
                : undefined,
            onReset: resetSimulation,
            replaying,
            onSetLanguage: setLanguage,
            onSetTimeScale: simulation.setTimeScale,
            onStart: startSimulationFromControls,
            onUndoBuild: worldBuilding.undo,
            onToggleLayer: (layer: ViewportLayerId) =>
              setLayers((current) => toggleViewportLayer(current, layer)),
            simulationStatus: simulation.snapshot.status,
            timeScale: simulation.snapshot.timeScale,
          }}
          inspectorProps={{
            dashboardSamples,
            elapsedSeconds: simulation.snapshot.elapsedSeconds,
            evacuation,
            journeyDurations,
            minuteFlows,
            onExportRunAnalytics: (kind: RunAnalyticsExport) =>
              downloadCsv(
                `${scene.id}-${kind}-${Math.floor(simulation.snapshot.elapsedSeconds)}s.csv`,
                runSeries.exportAnalyticsCsv(kind),
              ),
            runSummary,
            heatmapCells,
            scene: scene,
            signals,
            simulationCredibility,
            trajectoryRecording,
            webGpuProbe: probes.webGpuProbe,
          }}
          language={language}
          onHome={() => setShowHome(true)}
          onStageTabChange={setStageTab}
          onViewModeChange={showView}
          panelDockProps={{
            context: {
              brandInsight:
                probes.shopDecisionProbe.status === "ready"
                  ? probes.shopDecisionProbe.brandInsight
                  : undefined,
              scene,
              trajectoryRecording,
            },
            language,
          }}
          sceneName={formatSceneName(scene, language)}
          stageProps={{
            editorTool,
            heatmapCells,
            language,
            layers,
            onApplyScene: applyScene,
            onEditorToolChange: selectEditorTool,
            onPlaceInWorld: worldBuilding.place,
            onPlaceLineInWorld: worldBuilding.placeLine,
            floors,
            viewFloor,
            onSelectViewFloor: setWatchedFloorId,
            viewScene,
            scene: scene,
            crowd: liveCrowd,
            stageTab,
            t,
            viewMode,
          }}
          stageTab={stageTab}
          t={t}
          readouts={hudReadouts}
          replay={
            replaying
              ? {
                  crowd: liveCrowd,
                  language,
                  onClose: () => setReplaying(false),
                  onExport: () =>
                    downloadCsv(
                      `${scene.id}-trajectories.csv`,
                      trajectoryCsv(trajectoryRecording),
                    ),
                  recording: trajectoryRecording,
                }
              : undefined
          }
          uiMode={uiMode}
          viewMode={viewMode}
        />
      </div>
    </>
  );
}
