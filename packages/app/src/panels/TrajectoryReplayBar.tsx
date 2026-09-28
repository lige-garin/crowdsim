import { useEffect, useMemo, useState } from "react";
import { HudIcon } from "../hudIcons";
import type { Language } from "../i18n";
import type { LiveCrowd } from "../engine/liveCrowd";
import {
  replayTrajectoryAt,
  type TrajectoryRecording,
} from "../analytics/trajectoryRecording";

const speeds = [1, 4, 16] as const;

const copy = {
  en: {
    close: "Back to live",
    export: "Trajectories CSV",
    pause: "Pause replay",
    people: "people",
    play: "Play replay",
    region: "Replay",
    time: "Replay time",
    title: "Replay",
  },
  zh: {
    close: "回到实时",
    export: "轨迹 CSV",
    pause: "暂停回放",
    people: "人",
    play: "播放回放",
    region: "回放",
    time: "回放时间",
    title: "回放",
  },
};

/**
 * Plays the recorded run back in the live views. The simulation is paused
 * while this is open; the crowd the views draw comes from the recording, pushed
 * into the same store the simulation feeds (liveCrowd), so every view and
 * overlay replays without knowing it.
 */
export function TrajectoryReplayBar({
  crowd,
  language,
  onClose,
  onExport,
  recording,
}: {
  crowd: LiveCrowd;
  language: Language;
  onClose: () => void;
  onExport: () => void;
  recording: TrajectoryRecording;
}) {
  const text = copy[language];
  const { frames } = recording;
  const start = frames[0]?.elapsedSeconds ?? 0;
  const end = frames.at(-1)?.elapsedSeconds ?? 0;
  const [time, setTime] = useState(end);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(4);

  const snapshot = useMemo(
    () => replayTrajectoryAt(recording, time),
    [recording, time],
  );
  useEffect(() => {
    crowd.set({ snapshot });
  }, [crowd, snapshot]);

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let frame = requestAnimationFrame(function advance(now) {
      const step = ((now - previous) / 1000) * speed;
      previous = now;
      setTime((current) => {
        const next = Math.min(end, current + step);
        if (next >= end) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(advance);
    });
    return () => cancelAnimationFrame(frame);
  }, [end, playing, speed]);

  function togglePlaying() {
    if (!playing && time >= end) setTime(start);
    setPlaying(!playing);
  }

  return (
    <section
      className="hud-panel hud-replay"
      aria-label={text.region}
      data-testid="trajectory-replay"
    >
      <strong className="hud-replay-title">{text.title}</strong>
      <button
        type="button"
        className="hud-key"
        aria-label={playing ? text.pause : text.play}
        title={playing ? text.pause : text.play}
        aria-pressed={playing}
        disabled={frames.length < 2}
        onClick={togglePlaying}
      >
        <HudIcon name={playing ? "pause" : "play"} />
      </button>
      <input
        type="range"
        aria-label={text.time}
        min={start}
        max={end}
        step="any"
        value={time}
        disabled={frames.length < 2}
        onChange={(event) => {
          setPlaying(false);
          setTime(Number(event.target.value));
        }}
      />
      <b className="hud-replay-time">
        {clock(time)} / {clock(end)}
      </b>
      <span className="hud-replay-count" data-testid="replay-agent-count">
        {snapshot.agentCount} {text.people}
      </span>
      <div className="hud-speeds" role="group" aria-label={text.region}>
        {speeds.map((value) => (
          <button
            type="button"
            key={value}
            className="hud-speed"
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>
      <button
        type="button"
        className="hud-key hud-key-text"
        data-testid="export-trajectories"
        disabled={frames.length === 0}
        onClick={onExport}
      >
        {text.export}
      </button>
      <button
        type="button"
        className="hud-key"
        aria-label={text.close}
        title={text.close}
        onClick={onClose}
      >
        <HudIcon name="close" />
      </button>
    </section>
  );
}

function clock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
