import { useState } from "react";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { useI18n } from "../i18n";
import {
  compareScenarioMeasures,
  describeComparison,
  measureScenario,
} from "../analytics/layoutComparison";

/**
 * Two saved layouts of the same site, run and compared (ADR-0034 stage 1).
 *
 * A scheme is a snapshot of the scene at the moment it was saved, kept as JSON
 * in localStorage — the same slot pattern the editor's own save chain uses,
 * and enough because a scheme is compared, never edited.
 *
 * Both runs are forced onto the baseline's seed. `compareScenarioMeasures`
 * refuses to compare two seeds, and rightly: a difference that is partly the
 * random stream is not a difference in the layout. Forcing it here, rather
 * than asking the user to keep two scenes' seeds in step, is the only way the
 * comparison can be about geometry.
 *
 * The measure loop is synchronous and blocks the main thread. That is stated
 * in the panel rather than hidden behind a spinner that cannot animate while
 * the thread is blocked.
 */

const storageKey = "crowdsim.layoutSchemes.v1";

/** A saved scheme: its JSON, plus the name to show, so nothing re-parses to
 * render a label. */
type Slot = { json: string; name: string } | null;

type Slots = { a: Slot; b: Slot };

const emptySlots: Slots = { a: null, b: null };

function readSlots(): Slots {
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    return emptySlots;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<Slots>;

    return { a: slot(parsed.a), b: slot(parsed.b) };
  } catch {
    // A half-written or hand-edited slot is not worth dying for: losing two
    // saved schemes is better than an app that will not open.
    return emptySlots;
  }
}

function slot(value: unknown): Slot {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { json?: unknown; name?: unknown };

  return typeof candidate.json === "string"
    ? { json: candidate.json, name: String(candidate.name ?? "") }
    : null;
}

function writeSlots(slots: Slots) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(slots));
  } catch {
    // Quota or storage disabled: the schemes stay in memory for this session.
  }
}

export function LayoutComparePanel({ scene }: { scene: CrowdSimScene }) {
  const { language } = useI18n();
  const zh = language === "zh";
  const [slots, setSlots] = useState<Slots>(readSlots);
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const title = zh ? "方案对比" : "Layout comparison";
  const ready = Boolean(slots.a && slots.b);

  const save = (which: "a" | "b") => {
    const next: Slots = {
      ...slots,
      [which]: { json: JSON.stringify(scene), name: scene.name || scene.id },
    };

    setSlots(next);
    writeSlots(next);
    setLines(null);
    setError(null);
  };

  const clear = () => {
    setSlots(emptySlots);
    writeSlots(emptySlots);
    setLines(null);
    setError(null);
  };

  /**
   * Painting "running" before the loop starts: the loop blocks the main
   * thread, so a state update followed immediately by the loop would never
   * render. The timeout gives React a task of its own first.
   */
  const run = () => {
    if (!slots.a || !slots.b) {
      return;
    }

    setRunning(true);
    setLines(null);
    setError(null);

    setTimeout(() => {
      try {
        const baseline = parseScene(JSON.parse(slots.a?.json ?? ""));
        const variant = parseScene(JSON.parse(slots.b?.json ?? ""));
        // Same seed, or the comparison is partly the random stream.
        const first = measureScenario(baseline, nameOf(baseline, "A"), {
          durationSeconds,
        });
        const second = measureScenario(
          { ...variant, seed: baseline.seed },
          nameOf(variant, "B"),
          { durationSeconds },
        );

        setLines(describeComparison(compareScenarioMeasures(first, [second])));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p data-testid="layout-compare-caveat">
        {zh
          ? "只比较两个方案之间的差值；绝对数值不可用于预测客流。两个方案会用同一个随机种子跑同样长的时长。"
          : "Only the difference between the two schemes is a claim; the absolute numbers are not a forecast. Both run with the same seed for the same length of time."}
      </p>
      <div>
        <button
          type="button"
          data-testid="layout-compare-save-a"
          onClick={() => save("a")}
        >
          {zh ? "把当前场景存为 A" : "Save current as A"}
        </button>
        <button
          type="button"
          data-testid="layout-compare-save-b"
          onClick={() => save("b")}
        >
          {zh ? "把当前场景存为 B" : "Save current as B"}
        </button>
        <button type="button" onClick={clear}>
          {zh ? "清空" : "Clear"}
        </button>
      </div>
      <p data-testid="layout-compare-slots">
        A：{slots.a?.name || (zh ? "（空）" : "(empty)")}
        {"   "}
        B：{slots.b?.name || (zh ? "（空）" : "(empty)")}
      </p>
      <label>
        {zh ? "跑批时长（秒）" : "Run length (s)"}
        <select
          data-testid="layout-compare-duration"
          value={durationSeconds}
          onChange={(event) => setDurationSeconds(Number(event.target.value))}
        >
          {[30, 60, 120].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        data-testid="layout-compare-run"
        disabled={!ready || running}
        onClick={run}
      >
        {running ? (zh ? "计算中…" : "running…") : zh ? "跑 A/B" : "Run A/B"}
      </button>
      <p>
        {zh
          ? "跑批在主线程同步进行：时长越长，界面卡住越久。"
          : "The run happens on the main thread: the longer it is, the longer the UI freezes."}
      </p>
      {error ? <code data-testid="layout-compare-error">{error}</code> : null}
      {lines ? (
        <ul className="editor-site-report" data-testid="layout-compare-report">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function nameOf(scene: CrowdSimScene, fallback: string) {
  return scene.name || scene.id || fallback;
}
