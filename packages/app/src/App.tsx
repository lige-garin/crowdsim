import { sceneFloors, sceneOnFloor, type CrowdSimScene } from "@crowdsim/scene-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHome } from "./AppHome";
import {
  createProject,
  readProjects,
  upsertProject,
  writeProjects,
} from "./projects/projectStore";
import { sceneForNewProject } from "./projects/sceneForNewProject";
import { AppWorkbench } from "./AppWorkbench";
import type { EvacuationState, StageTab, StageViewMode } from "./AppTypes";
import { createSystemSignals } from "./appSignals";
import { createHudReadouts } from "./appTopbarMetrics";
import { createDashboardStats } from "./analytics/dashboardStats";
import { defaultDemoScene as initialScene } from "./scenes/defaultDemoScene";
import { createEvacuationFlowPlan } from "./engine/evacuationPlan";
import {
  createHeatmapCellsFromSamples,
  heatmapSamplesOnFloor,
} from "./analytics/heatmap";
import { formatSceneName, I18nProvider, useI18n } from "./i18n";
import { UiModeProvider, useUiMode } from "./uiMode";
import { createSimulationCredibilityReport } from "./engine/simulationCredibility";
import { createLiveSimulationRuntimeArtifact } from "./engine/simulationRuntimeArtifact";
import { useAppProbes } from "./useAppProbes";
import { useSimulationController } from "./useSimulationController";
import { useSimulationWorkerController } from "./useSimulationWorkerController";
import { usesWorkerSimulationPath } from "./engine/simulationThread";
import { useWasmDecisionRuntime } from "./engine/wasmDecisionRuntime";
import type { EditorTool } from "./editor/sceneEditorState";
import { placesInWorld } from "./renderer/worldPlacement";
import { useWorldBuilding } from "./editor/useWorldBuilding";
import { hotUpdateBlocker } from "./engine/simulationEngine";
import { createLiveCrowd } from "./engine/liveCrowd";
import { downloadCsv } from "./analytics/runAnalytics";
import { useRunSeries } from "./analytics/useRunSeries";
import { trajectoryCsv } from "./analytics/trajectoryRecording";
import { toggleUrlFlag } from "./urlFlagToggle";
import type { RunAnalyticsExport } from "./panels/RunAnalyticsPanel";
import {
  defaultViewportLayers,
  toggleViewportLayer,
  type ViewportLayerId,
} from "./viewport/viewportLayers";
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
  // `?mainsim` forces the main-thread CPU simulation. It is the working path
  // when there is no WebGPU (otherwise the app falls back to the worker path)
  // and is also what headless visual testing uses to render a live crowd.
  const forceMainSim =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mainsim");
  // ADR-0033 stage 3: the explicit, labelled, opt-in toggle for GPU-backed
  // movement -- read ONCE from a stable URL flag, exactly like `?mainsim`
  // above, never from an async probe (same "empty city" lesson this file
  // already learned once: switching a running simulation's behaviour
  // reactively off something that resolves later abandons real work). Only
  // the worker path can honour this (see `useSimulationWorkerController`'s
  // own doc comment) -- the main-thread fallback stays cpu-compat always.
  const requestGpuMovement =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("gpumove");
  // The "explicit, labelled toggle" ADR-0033 stage 3 itself calls for, that
  // stage originally shipped without (a URL flag alone, no click target
  // anywhere in the app). A real reload, not a state flip, because the flag
  // above is deliberately read-once-at-mount -- see its own comment.
  const onToggleGpuMovement = () => {
    if (typeof window === "undefined") return;
    window.location.assign(toggleUrlFlag(window.location.href, "gpumove"));
  };
  // Both paths run the same CPU social-force model by default. The main-thread
  // path used to hand movement to a separate WebGPU backend (its own GPU
  // device, an O(N²) shader, no notion of browsing or queuing), so `?mainsim`
  // simulated a different crowd from the default worker path.
  const mainThreadSimulation = useSimulationController(scene, {});
  const workerSimulation = useSimulationWorkerController(scene, {
    requestGpuMovement,
  });
  // Pick the simulation path from the stable ?mainsim flag only, never from the
  // async WebGPU probe. Gating on webGpuMovementBackend.backend flipped the path
  // worker -> main the moment the probe resolved, abandoning the running worker
  // sim for a never-started main engine: the "empty city" bug on WebGPU machines.
  const usesWorkerSimulation = usesWorkerSimulationPath({ forceMainSim });
  const simulation = usesWorkerSimulation ? workerSimulation : mainThreadSimulation;
  // The real, currently-active backend (ADR-0033 stage 3) -- the main-thread
  // fallback never runs GPU movement, and the worker path reports "cpu-compat"
  // until its own first status push arrives (right after init, which is
  // accurate: nothing GPU-backed has run yet at that point either).
  const activeMovementBackend: "cpu-compat" | "webgpu" = usesWorkerSimulation
    ? (workerSimulation.movementBackend?.active ?? "cpu-compat")
    : "cpu-compat";
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
        movementBackend: activeMovementBackend,
        sharedMemory: workerSimulation.worker.sharedMemory ? "sab" : "fallback",
        thread: usesWorkerSimulation ? "worker" : "main",
      }),
    [activeMovementBackend, usesWorkerSimulation, workerSimulation.worker.sharedMemory],
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
    placeOccupancyOverTime,
    runSummary,
    trajectoryRecording,
  } = runSeries;
  const [heatmapWindowSeconds, setHeatmapWindowSeconds] = useState(30);
  /**
   * Gridding the heatmap costs O(samples × agents) over the whole rolling
   * window — measured at 17.6 ms for 2 000 people and the default 30 s window,
   * i.e. most of a core at the four-times-a-second rate `heatmapSamples` grows
   * at, and once per floor again for the peak below. A 30-second aggregate does
   * not need redrawing four times a second, so the samples the grid reads are
   * held back to one a second. The samples themselves are untouched: the
   * credibility report reads every one of them.
   */
  const heatmapSamplesRef = useRef(heatmapSamples);
  const [griddedHeatmapSamples, setGriddedHeatmapSamples] = useState(heatmapSamples);
  useEffect(() => {
    heatmapSamplesRef.current = heatmapSamples;
  }, [heatmapSamples]);
  useEffect(() => {
    const intervalId = window.setInterval(
      () => setGriddedHeatmapSamples(heatmapSamplesRef.current),
      1000,
    );
    return () => window.clearInterval(intervalId);
  }, []);
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [stageTab, setStageTab] = useState<StageTab>("run");
  const [layers, setLayers] = useState(defaultViewportLayers);
  const [showHome, setShowHome] = useState(true);
  // "Creating a project" is a mode on the home screen, not a route: there is no
  // router here and adding one for a single flow would be a lot of machinery
  // for a wizard with three steps. False means the list.
  const [creatingProject, setCreatingProject] = useState(false);
  // What the map step produced, waiting for the form step to consume it.
  const [pendingLocation, setPendingLocation] = useState<{
    lat: number;
    lng: number;
    radiusMeters: number;
  } | null>(null);
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
    () => heatmapSamplesOnFloor(griddedHeatmapSamples, viewFloorId),
    [griddedHeatmapSamples, viewFloorId],
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
        heatmapSamplesOnFloor(griddedHeatmapSamples, floor.id),
        { cellSize: 2, windowSeconds: heatmapWindowSeconds },
      );

      return cells.reduce((best, cell) => Math.max(best, cell.count), peak);
    }, 0);
  }, [floors, griddedHeatmapSamples, heatmapCells, heatmapWindowSeconds, scene]);
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
  /** Whether opening the replay was what stopped a live run — see `exitReplay`. */
  const resumeAfterReplayRef = useRef(false);
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
  /**
   * Opening the replay stops the run so the scrubbed frames are not fighting
   * live ones. Closing it used to leave the run stopped for good: `onClose`
   * only dropped the replay bar, so `userPausedRef` stayed set and the
   * auto-start effect above refused to bring the city back — the same dead
   * end this latch exists to prevent, reached by a second door. Exiting now
   * puts back what entering took: a run that was live resumes, one the user
   * had already paused stays paused.
   */
  function enterReplay() {
    resumeAfterReplayRef.current = simulationStatus === "running";
    pauseSimulation();
    setReplaying(true);
  }
  function exitReplay() {
    setReplaying(false);
    if (!resumeAfterReplayRef.current) return;
    resumeAfterReplayRef.current = false;
    startSimulationFromControls();
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
    movementBackend: activeMovementBackend,
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
          creatingProject={creatingProject}
          language={language}
          onCancelProjectCreate={() => setCreatingProject(false)}
          onCreateProject={() => setCreatingProject(true)}
          onProjectPlace={(point, radiusMeters) => {
            // Held here rather than in the map component, so step 3 reads it
            // from one place instead of it being threaded back through.
            // `creatingProject` deliberately stays true: the wizard is not
            // finished, it is on its last step. Clearing it here dropped the
            // user back to the list, because `creatingProject` is what decides
            // whether the wizard or the list is on screen.
            setPendingLocation({ ...point, radiusMeters });
          }}
          onProjectSubmit={(details) => {
            const location = pendingLocation;

            if (!location) return;

            const now = new Date().toISOString();
            // Spelled out rather than spread: `details` is the form's shape
            // and this is the record's, and spreading one into the other would
            // make the difference invisible.
            const project = createProject(
              {
                areaSquareMeters: details.areaSquareMeters,
                businessCategory: details.businessCategory,
                catchmentRadiusMeters: location.radiusMeters,
                contractVersion: 1,
                coordinateSystem: "GCJ-02",
                createdAt: now,
                floors: details.floors,
                id: `p-${Date.now().toString(36)}`,
                kind: details.kind,
                lat: location.lat,
                lng: location.lng,
                name: details.name,
                planSource: details.planSource,
                updatedAt: now,
              },
              sceneForNewProject(details, location),
            );

            // A refused save is the list's problem to report, not this screen's:
            // the project exists either way and the next read will say so.
            writeProjects(upsertProject(project, readProjects()));
            applyScene(project.scene);
            setPendingLocation(null);
            setCreatingProject(false);
            setShowHome(false);
          }}
          pendingLocation={pendingLocation}
          onEnterLab={() => enterLab()}
          onOpenNetwork={() => enterLab("network")}
          onOpenProject={(project) => {
            // A project opens the scene it carries, which is the whole point of
            // keeping one: the list is not a menu of scenes, it is a list of
            // the things a person has been working on.
            applyScene(project.scene);
            setShowHome(false);
          }}
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
                ? () => (replaying ? exitReplay() : enterReplay())
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
            gpuMovementAvailable: usesWorkerSimulation,
            gpuMovementRequested: requestGpuMovement,
            journeyDurations,
            minuteFlows,
            placeOccupancyOverTime,
            onExportRunAnalytics: (kind: RunAnalyticsExport) =>
              downloadCsv(
                `${scene.id}-${kind}-${Math.floor(simulation.snapshot.elapsedSeconds)}s.csv`,
                runSeries.exportAnalyticsCsv(kind),
              ),
            onToggleGpuMovement,
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
              onApplyScene: applyScene,
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
            // Only the ACTIVE simulation path's failures are user-level news:
            // under ?mainsim the worker controller still runs but nothing
            // depends on it, and a fault card from it would be a lie.
            simulationFault:
              usesWorkerSimulation && workerSimulation.worker.status === "error"
                ? {
                    message: workerSimulation.worker.message,
                    onRetry: workerSimulation.retry,
                  }
                : null,
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
                  onClose: exitReplay,
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
