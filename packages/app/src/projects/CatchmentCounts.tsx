import { useState } from "react";
import { useI18n } from "../i18n";
import { amapKeySource, readAmapKey, writeAmapKey } from "./amapKey";
import { queryPoisAround, type PoiQueryResult } from "./amapPoi";

/**
 * What is actually around the site, counted by Amap.
 *
 * This is the one screen where the app talks to Amap's POI API, and three
 * things have to stay true on it:
 *
 * - **"Not asked" is not zero.** The query is a button, so the untouched state
 *   says so. A panel that showed 0 for every layer before anyone pressed it
 *   would be claiming the site is empty, which is a different and wrong claim.
 * - **A failed layer is not zero either.** A refused request is shown as a
 *   failure with Amap's own reason, because the fix differs for a bad key, an
 *   exhausted quota and a bad type code.
 * - **Every number is a listing count, not a measurement of people.** Amap
 *   returns places; it does not return how many people are in them. The panel
 *   says "listings" rather than "residents" throughout, and the counts are
 *   capped at one page of 25 per layer with a note when there are more.
 *
 * It deliberately does not feed the simulation. Arrival rates from POI counts
 * need coefficients that are not calibrated (ADR-0034 Stage 2, not shipped),
 * and a panel that looked connected to the run would be claiming a link that
 * does not exist yet.
 */

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: PoiQueryResult }
  | { kind: "failed"; message: string };

export function CatchmentCounts({
  lat,
  lng,
  radiusMeters,
}: {
  lat: number;
  lng: number;
  radiusMeters: number;
}) {
  const { language } = useI18n();
  const zh = language === "zh";
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [keyDraft, setKeyDraft] = useState("");
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  // Whether that notice is good news, because the red `storage-error` style
  // means one thing elsewhere in this form — the write was refused — and
  // reusing it for "saved" would paint a success red.
  const [keyStored, setKeyStored] = useState(false);
  // The key is state, not a call at render time: this component is what writes
  // it, so caching the read would leave the field asking for a key that is
  // already saved. `readAmapKey` is the initialiser, and `keyFrom` comes along
  // with it because "which of the two sources is this" is the same fact.
  const [stored, setStored] = useState(() => ({
    key: readAmapKey(),
    from: amapKeySource(),
  }));

  const ask = async () => {
    if (!stored.key) {
      setStatus({
        kind: "failed",
        message: zh ? "没有可用的 key" : "No key available",
      });

      return;
    }

    setStatus({ kind: "running" });

    try {
      setStatus({
        kind: "done",
        result: await queryPoisAround({ key: stored.key, lat, lng, radiusMeters }),
      });
    } catch (error) {
      setStatus({
        kind: "failed",
        message: error instanceof Error ? error.message : "the request failed",
      });
    }
  };

  const saveKey = () => {
    const okToStore = writeAmapKey(keyDraft);

    setStored({ key: readAmapKey(), from: amapKeySource() });
    setKeyStored(okToStore);
    setKeyNotice(
      okToStore
        ? zh
          ? "已保存到这个浏览器。"
          : "Saved in this browser."
        : zh
          ? "浏览器拒绝写入（隐私模式？），这个 key 只在本次会话里有效。"
          : "The browser refused to write (private mode?) — this key works for this session only.",
    );
    setKeyDraft("");
  };

  return (
    <section
      className="catchment-counts"
      aria-label={zh ? "周边实测" : "What is around the site"}
    >
      <p className="home-step-label">{zh ? "周边实测" : "Around the site"}</p>

      <p className="catchment-counts-intro">
        {zh ? (
          <>
            这些是高德 POI 的<b>地点条目数</b>
            ，不是人数。要人数得有标定过的系数，现在还没有 ——
            所以这些数字不参与仿真，只帮你判断这个位置像什么。查询是手动触发的，每次都会消耗高德配额。
          </>
        ) : (
          <>
            These are Amap POI <b>listing counts</b>, not people. Turning them into
            people needs coefficients that have not been calibrated, so these numbers
            stay out of the simulation and only help you judge what the location is
            like. The query is manual and each press spends Amap quota.
          </>
        )}
      </p>

      <div className="catchment-key">
        {stored.key ? (
          <p className="catchment-key-state" data-testid="catchment-key-state">
            {zh ? "已配置 key" : "A key is configured"}
            <small>
              {stored.from === "typed"
                ? zh
                  ? "（你输入的，存在这个浏览器里）"
                  : "(the one you typed, in this browser)"
                : zh
                  ? "（随构建附带的）"
                  : "(shipped with the build)"}
            </small>
          </p>
        ) : (
          <div className="catchment-key-form">
            <label>
              {zh ? "高德 Web 服务 key" : "Amap Web服务 key"}
              <input
                type="text"
                data-testid="catchment-key-input"
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder={zh ? "在控制台申请「Web服务」类型" : "Console → Web服务"}
              />
            </label>
            <button
              type="button"
              data-testid="catchment-key-save"
              disabled={keyDraft.trim().length === 0}
              onClick={saveKey}
            >
              {zh ? "保存" : "Save"}
            </button>
            <p className="catchment-key-warning">
              {zh
                ? "key 会以明文存在这个浏览器里，任何打开它的人都能看到。控制台里请选带 referer 白名单的「Web服务」类型，不要用服务端 key。这个 key 不会写进导出的项目里。"
                : "The key is stored in plain text in this browser and anyone who opens it can read it. Use a referer-restricted Web服务 key from the console, not a server-side key. It is not written into exported projects."}
            </p>
          </div>
        )}
        {keyNotice ? (
          <p
            className={keyStored ? "key-notice" : "storage-error"}
            data-testid="catchment-key-notice"
          >
            {keyNotice}
          </p>
        ) : null}
      </div>

      <div className="catchment-counts-actions">
        <button
          type="button"
          data-testid="catchment-ask"
          disabled={!stored.key || status.kind === "running"}
          onClick={() => void ask()}
        >
          {status.kind === "running"
            ? zh
              ? "查询中…"
              : "Querying…"
            : zh
              ? "查一下周边有什么"
              : "Look up what's around"}
        </button>
        <span className="catchment-counts-radius">
          {zh
            ? `半径 ${Math.round(radiusMeters)} m`
            : `${Math.round(radiusMeters)} m radius`}
        </span>
      </div>

      {/*
       * The three states are kept apart on purpose. "Not asked" and "asked and
       * found none" both render rows, and only the heading distinguishes them,
       * because a panel that cannot tell those apart is how a missing number
       * becomes a false one.
       */}
      {status.kind === "idle" ? (
        <p className="catchment-counts-idle" data-testid="catchment-idle">
          {zh
            ? "还没有查询过 —— 上面的表是空的，不是零。"
            : "Not queried yet — the table above is empty, not zero."}
        </p>
      ) : null}

      {status.kind === "failed" ? (
        <p className="storage-error" data-testid="catchment-failed">
          {zh ? `查询失败：${status.message}` : `The query failed: ${status.message}`}
        </p>
      ) : null}

      {status.kind === "done" ? (
        <CatchmentTable result={status.result} zh={zh} />
      ) : null}
    </section>
  );
}

function CatchmentTable({ result, zh }: { result: PoiQueryResult; zh: boolean }) {
  return (
    <div className="catchment-table-wrap">
      <table className="catchment-table" data-testid="catchment-table">
        <caption>
          {zh
            ? `${Math.round(result.radiusMeters)} 米内的高德 POI 条目数${result.succeeded < result.requested ? `（${result.requested} 层里成功 ${result.succeeded} 层）` : ""}`
            : `Amap POI listings within ${Math.round(result.radiusMeters)} m${
                result.succeeded < result.requested
                  ? ` (${result.succeeded} of ${result.requested} layers came back)`
                  : ""
              }`}
        </caption>
        <tbody>
          {result.layers.map((layer) => (
            <tr key={layer.key} data-testid={`catchment-row-${layer.key}`}>
              <th scope="row">{zh ? layer.labelZh : layer.labelEn}</th>
              {layer.count === null ? (
                <td
                  className="catchment-row-failed"
                  data-testid={`catchment-failed-${layer.key}`}
                >
                  {zh ? "查询失败" : "failed"}
                  {layer.failure ? <small>{layer.failure}</small> : null}
                </td>
              ) : (
                <td>
                  {layer.count}
                  {layer.truncated ? (
                    <small
                      data-testid={`catchment-truncated-${layer.key}`}
                      title={
                        zh
                          ? `高德说这一层有 ${layer.reportedTotal} 条，每页只取 25 条`
                          : `Amap found ${layer.reportedTotal}; one page holds 25`
                      }
                    >
                      {zh ? "（还有更多）" : " (more)"}
                    </small>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="catchment-counts-footnote">
        {zh
          ? "没有去重：同一个小区有多处出入口就可能被算成几条。数量只到每层 25 条为止，超过会标「还有更多」。"
          : "Not de-duplicated — one community with several gates can count more than once, and each layer stops at 25, marked where there are more."}
      </p>
    </div>
  );
}
