import { useI18n } from "../i18n";
import {
  summarizeTrajectoryRecording,
  type TrajectoryRecording,
} from "../analytics/trajectoryRecording";

/** Bytes a recorded sample takes: an id, four motion floats and a state byte. */
const bytesPerSample = 4 + 4 * 4 + 1;

type TrajectoryReplayPanelProps = {
  recording: TrajectoryRecording;
};

export function TrajectoryReplayPanel({ recording }: TrajectoryReplayPanelProps) {
  const { language } = useI18n();
  const summary = summarizeTrajectoryRecording(recording);
  const megabytes = ((recording.sampleCount * bytesPerSample) / 1e6).toFixed(1);
  const title = language === "zh" ? "记录 / 回放" : "Record / replay";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {language === "zh"
          ? "运行中每个仿真秒记录一帧全体人员的位置、速度与状态。点底部运行控制里的回放按钮拖动时间轴查看，并可导出轨迹 CSV。"
          : "Every simulated second the run records each person's position, velocity and state. Open replay from the transport controls to scrub it and export trajectories as CSV."}
      </p>
      <code>
        frames {summary.frameCount} | agents {summary.uniqueAgentCount} | span{" "}
        {summary.durationSeconds}s | samples {recording.sampleCount} ({megabytes} MB) |
        runtime {recording.runtime.thread}/{recording.runtime.sharedMemory}
      </code>
    </section>
  );
}
