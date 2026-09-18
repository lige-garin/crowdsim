import type { CrowdSimScene } from "@crowdsim/scene-schema";
import { useEffect, useRef, useState } from "react";
import type { DashboardSample } from "./dashboardStats";
import type { HeatmapSample } from "./heatmap";
import { createRunAnalytics, type RunAnalytics } from "./runAnalytics";
import type { SimulationSnapshot } from "./simulationEngine";
import type { SimulationRuntimeArtifact } from "./simulationRuntimeArtifact";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
} from "./trajectoryRecording";

/** Charts keep the last two minutes; the analytics and the recording keep the run. */
const chartSeconds = 120;

/**
 * Everything sampled from the running crowd once a simulated second: the
 * dashboard and heatmap series, the measured results (runAnalytics) and the
 * trajectory recording that replay plays back.
 *
 * Polled a few times a wall-clock second and deduplicated by simulated second,
 * so fast-forward still samples most seconds instead of one in eight.
 */
export function useRunSeries({
  runtime,
  scene,
  snapshot,
}: {
  runtime: SimulationRuntimeArtifact;
  scene: CrowdSimScene;
  snapshot: SimulationSnapshot;
}) {
  const latest = useRef({ runtime, scene, snapshot });
  useEffect(() => {
    latest.current = { runtime, scene, snapshot };
  }, [runtime, scene, snapshot]);

  const analyticsRef = useRef(createRunAnalytics());
  const lastSecondRef = useRef(-1);
  const [runSummary, setRunSummary] = useState(() => createRunAnalytics().summary());
  const [dashboardSamples, setDashboardSamples] = useState<DashboardSample[]>([
    {
      agentCount: snapshot.agentCount,
      elapsedSeconds: snapshot.elapsedSeconds,
      exitedCount: snapshot.exitedCount,
    },
  ]);
  const [heatmapSamples, setHeatmapSamples] = useState<HeatmapSample[]>([]);
  const [trajectoryRecording, setTrajectoryRecording] = useState(() =>
    newRecording(scene, runtime),
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const { runtime, scene, snapshot } = latest.current;
      const second = Math.floor(snapshot.elapsedSeconds);
      if (snapshot.status !== "running" || second === lastSecondRef.current) return;
      lastSecondRef.current = second;

      analyticsRef.current.record(scene, snapshot);
      setRunSummary(analyticsRef.current.summary());
      setHeatmapSamples((samples) =>
        [
          ...samples,
          {
            agents: snapshot.agents.map(({ id, x, y }) => ({ id, x, y })),
            elapsedSeconds: snapshot.elapsedSeconds,
          },
        ].slice(-chartSeconds),
      );
      setDashboardSamples((samples) =>
        [
          ...samples,
          {
            agentCount: snapshot.agentCount,
            elapsedSeconds: snapshot.elapsedSeconds,
            exitedCount: snapshot.exitedCount,
          },
        ].slice(-chartSeconds),
      );
      setTrajectoryRecording((recording) =>
        appendTrajectoryFrame(
          sameRuntime(recording.runtime, runtime)
            ? recording
            : newRecording(scene, runtime),
          snapshot,
        ),
      );
    }, 250);
    return () => window.clearInterval(intervalId);
  }, []);

  /** Start every series over: they describe a new run. */
  function clear(forScene: CrowdSimScene) {
    analyticsRef.current = createRunAnalytics();
    lastSecondRef.current = -1;
    setRunSummary(analyticsRef.current.summary());
    setDashboardSamples([{ agentCount: 0, elapsedSeconds: 0, exitedCount: 0 }]);
    setHeatmapSamples([]);
    setTrajectoryRecording(newRecording(forScene, latest.current.runtime));
  }

  return {
    clear,
    dashboardSamples,
    exportAnalyticsCsv: (kind: keyof RunAnalytics["csv"]) =>
      analyticsRef.current.csv[kind](),
    heatmapSamples,
    runSummary,
    trajectoryRecording,
  };
}

function newRecording(scene: CrowdSimScene, runtime: SimulationRuntimeArtifact) {
  return createTrajectoryRecording({
    id: "live-recording",
    runtime,
    sceneId: scene.id,
    seed: scene.seed,
  });
}

function sameRuntime(
  left: SimulationRuntimeArtifact,
  right: SimulationRuntimeArtifact,
) {
  return (
    left.decisionBackend === right.decisionBackend &&
    left.decisionHz === right.decisionHz &&
    left.movementBackend === right.movementBackend &&
    left.movementHz === right.movementHz &&
    left.sharedMemory === right.sharedMemory &&
    left.thread === right.thread
  );
}
