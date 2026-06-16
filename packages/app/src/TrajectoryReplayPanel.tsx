import { useMemo } from "react";
import { useI18n } from "./i18n";
import {
  estimatePackedTrajectoryBytes,
  packTrajectoryRecording,
  replayTrajectoryAt,
  summarizeTrajectoryRecording,
  type TrajectoryRecording,
} from "./trajectoryRecording";

type TrajectoryReplayPanelProps = {
  recording: TrajectoryRecording;
};

export function TrajectoryReplayPanel({ recording }: TrajectoryReplayPanelProps) {
  const { language } = useI18n();
  const summary = useMemo(() => {
    const replayAtSeconds =
      recording.frames.length > 0
        ? recording.frames[Math.floor((recording.frames.length - 1) / 2)].elapsedSeconds
        : 0;
    const replay = replayTrajectoryAt(recording, replayAtSeconds);
    const packed = packTrajectoryRecording(recording);

    return {
      packedBytes: estimatePackedTrajectoryBytes(packed),
      replayAgentCount: replay.agents.length,
      replayAtSeconds: replay.elapsedSeconds,
      runtime: `${recording.runtime.thread}/${recording.runtime.sharedMemory}`,
      ...summarizeTrajectoryRecording(recording),
    };
  }, [recording]);
  const title = language === "zh" ? "记录 / 回放" : "Record / replay";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "实时轨迹记录、插值回放和导出摘要已绑定当前仿真运行。"
          : "Live trajectory recording, interpolated replay, and export summary are bound to the current simulation run."}
      </p>
      <code>
        frames {summary.frameCount} | agents {summary.uniqueAgentCount} | replay{" "}
        {summary.replayAtSeconds}s/{summary.replayAgentCount} | packed{" "}
        {summary.packedBytes}b | runtime {summary.runtime}
      </code>
    </section>
  );
}
