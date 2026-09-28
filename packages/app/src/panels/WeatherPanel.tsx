import { useCallback, useState } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  fetchCurrentWeather,
  weatherCodeToFactorKind,
  weatherToEnvironmentFactors,
  type NormalizedWeatherSnapshot,
  type WeatherEnvironmentFactorInput,
} from "../weatherMcpClient";
import { applyWeatherFactorsToScene } from "../weatherSceneApply";
import { useI18n } from "../i18n";

/**
 * The editor panel `weatherMcpClient.ts` (ADR-0028) named as real,
 * separable work left for later: a control that fetches a real live
 * weather snapshot and drops the resulting environment factors into the
 * scene under edit, the same "primitive first, UI wiring later" split
 * this backlog's other items already took (Sobol/ADR-0027).
 *
 * A one-shot fetch on a button press, not continuous polling — ADR-0028's
 * own scope line, unchanged here: nothing schedules a repeat fetch, and
 * nothing wires this into the running simulation's step loop.
 */

/** Shanghai — the same arbitrary starting point `defaultDemoScene.ts` picked
 * for `weatherProfile.location`, used here only when the open scene has not
 * set its own. */
const fallbackLatitude = 31.2304;
const fallbackLongitude = 121.4737;

type WeatherPanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "done";
      snapshot: NormalizedWeatherSnapshot;
      factors: WeatherEnvironmentFactorInput[];
    }
  | { kind: "failed"; message: string };

export function WeatherPanel({
  scene,
  onApplyScene,
  fetchImpl,
}: {
  scene: CrowdSimScene;
  onApplyScene?: (scene: CrowdSimScene) => void;
  /** Injected by tests; the app uses the real `fetch`. */
  fetchImpl?: typeof fetch;
}) {
  const { language } = useI18n();
  const zh = language === "zh";
  const location = scene.weatherProfile.location;
  const [latitude, setLatitude] = useState(location?.latitude ?? fallbackLatitude);
  const [longitude, setLongitude] = useState(location?.longitude ?? fallbackLongitude);
  const [state, setState] = useState<WeatherPanelState>({ kind: "idle" });
  const [applied, setApplied] = useState(false);

  const run = useCallback(() => {
    setState({ kind: "loading" });
    setApplied(false);
    fetchCurrentWeather(latitude, longitude, fetchImpl)
      .then((snapshot) => {
        setState({
          factors: weatherToEnvironmentFactors(snapshot),
          kind: "done",
          snapshot,
        });
      })
      .catch((error: unknown) => {
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "Weather fetch failed",
        });
      });
  }, [fetchImpl, latitude, longitude]);

  const apply = useCallback(() => {
    if (state.kind !== "done" || !onApplyScene) return;
    onApplyScene(applyWeatherFactorsToScene(scene, state.factors));
    setApplied(true);
  }, [onApplyScene, scene, state]);

  const title = zh ? "实时天气" : "Live weather";

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {zh
          ? "从 Open-Meteo 抓一次当前坐标的真实天气,换算成场景的环境因子——单次抓取,不在仿真运行中持续轮询。"
          : "One real fetch from Open-Meteo for the given coordinates, converted into scene environment factors — a single fetch, not continuous polling while the simulation runs."}
      </p>
      <label>
        {zh ? "纬度" : "Latitude"}
        <input
          type="number"
          data-testid="weather-latitude"
          value={latitude}
          step="0.0001"
          onChange={(event) => setLatitude(Number(event.target.value))}
        />
      </label>
      <label>
        {zh ? "经度" : "Longitude"}
        <input
          type="number"
          data-testid="weather-longitude"
          value={longitude}
          step="0.0001"
          onChange={(event) => setLongitude(Number(event.target.value))}
        />
      </label>
      <button type="button" data-testid="weather-fetch" onClick={run}>
        {zh ? "抓取天气" : "Fetch weather"}
      </button>
      {state.kind === "loading" ? (
        <code data-testid="weather-loading">{zh ? "抓取中" : "fetching"}</code>
      ) : null}
      {state.kind === "failed" ? (
        <code data-testid="weather-error">{state.message}</code>
      ) : null}
      {state.kind === "done" ? (
        <>
          <p data-testid="weather-snapshot">
            {state.snapshot.temperatureCelsius.toFixed(1)}°C,{" "}
            {state.snapshot.precipitationMmPerHour.toFixed(1)} mm/h,{" "}
            {state.snapshot.windSpeedKmPerHour.toFixed(1)} km/h
            {(() => {
              const kind = weatherCodeToFactorKind(state.snapshot.weatherCode);
              return kind ? ` (${kind})` : "";
            })()}
          </p>
          {state.factors.length === 0 ? (
            <p data-testid="weather-no-factors">
              {zh
                ? "当前天气不满足任何因子的触发阈值,场景不会改变。"
                : "Current weather crosses none of the factor thresholds — the scene is unchanged."}
            </p>
          ) : (
            <ul className="weather-factor-list">
              {state.factors.map((factor) => (
                <li key={factor.id} data-testid={`weather-factor-${factor.kind}`}>
                  {factor.kind}: severity {factor.severity?.toFixed(2) ?? "0.50"}
                </li>
              ))}
            </ul>
          )}
          {onApplyScene ? (
            <button type="button" data-testid="weather-apply" onClick={apply}>
              {zh ? "应用到场景" : "Apply to scene"}
            </button>
          ) : null}
          {applied ? (
            <code data-testid="weather-applied">{zh ? "已应用" : "applied"}</code>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
