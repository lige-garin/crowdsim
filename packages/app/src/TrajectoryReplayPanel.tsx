import { useMemo } from "react";
import { useI18n } from "./i18n";
import type { SimulationSnapshot } from "./simulationEngine";
import {
  appendTrajectoryFrame,
  createTrajectoryRecording,
  estimatePackedTrajectoryBytes,
  packTrajectoryRecording,
  replayTrajectoryAt,
  summarizeTrajectoryRecording,
} from "./trajectoryRecording";

export function TrajectoryReplayPanel() {
  const { language } = useI18n();
  const summary = useMemo(() => {
    const recording = [snapshot(0, 1), snapshot(2, 1), snapshot(3, 2)].reduce(
      (current, item) => appendTrajectoryFrame(current, item),
      createTrajectoryRecording({
        id: "demo-recording",
        sceneId: "atrium-demo",
        seed: 1,
      }),
    );
    const replay = replayTrajectoryAt(recording, 1);
    const packed = packTrajectoryRecording(recording);

    return {
      packedBytes: estimatePackedTrajectoryBytes(packed),
      replayAgentCount: replay.agents.length,
      replayAtSeconds: replay.elapsedSeconds,
      ...summarizeTrajectoryRecording(recording),
    };
  }, []);
  const title = language === "zh" ? "录制 / 回放" : "Record / replay";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "轨迹记录、插值回放、摘要统计已可用。"
          : "Trajectory recording, interpolated replay, and summary stats are ready."}
      </p>
      <code>
        frames {summary.frameCount} | agents {summary.uniqueAgentCount} | replay{" "}
        {summary.replayAtSeconds}s/{summary.replayAgentCount} | packed{" "}
        {summary.packedBytes}b
      </code>
    </section>
  );
}

function snapshot(elapsedSeconds: number, agentId: number): SimulationSnapshot {
  return {
    agentCount: 1,
    agents: [
      {
        id: agentId,
        targetX: 10,
        targetY: 0,
        vx: 1,
        vy: 0,
        x: elapsedSeconds,
        y: elapsedSeconds / 2,
      },
    ],
    elapsedSeconds,
    exitedCount: 0,
    spawnedCount: agentId,
    status: "running",
    stepCount: elapsedSeconds * 10,
    timeScale: 1,
  };
}
