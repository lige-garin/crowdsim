import { useMemo } from "react";
import { useI18n, type LocalizedText } from "./i18n";
import type { CrowdContactLink, CrowdContactNetwork } from "./crowdContactNetwork";

const stateColor: Record<string, string> = {
  browse: "#2ecf8c",
  enterStore: "#2fd0ff",
  checkout: "#2fd0ff",
  queue: "#c8ff2d",
  walk: "#4d8cff",
  leave: "#93a3bd",
  evacuate: "#ff6b5d",
};

const stateLabel: Record<string, LocalizedText> = {
  browse: { zh: "逛店", en: "browsing" },
  enterStore: { zh: "结账", en: "checkout" },
  checkout: { zh: "去结账", en: "to checkout" },
  queue: { zh: "排队", en: "queuing" },
  walk: { zh: "步行", en: "walking" },
  leave: { zh: "离场", en: "leaving" },
  evacuate: { zh: "疏散", en: "evacuating" },
};

const kindColor: Record<CrowdContactLink["kind"], string> = {
  sameShop: "#2ecf8c",
  queue: "#c8ff2d",
  proximity: "#4d8cff",
};

const kindLabel: Record<CrowdContactLink["kind"], LocalizedText> = {
  sameShop: { zh: "同店相遇", en: "same shop" },
  queue: { zh: "排队相邻", en: "queuing together" },
  proximity: { zh: "近距离", en: "close contact" },
};

const copy = {
  contacts: { zh: "接触", en: "contacts" },
  edges: { zh: "连线", en: "links" },
  empty: {
    zh: "暂无近距离接触 —— 等客流在店铺或排队处聚集后会自动浮现。",
    en: "No close contacts yet — they appear as the crowd clusters at shops or queues.",
  },
  graphLabel: { zh: "接触网络图", en: "Contact network graph" },
  subtitle: {
    zh: "仿真中真实的近距离接触（同店、排队、路过）形成可追踪的人际网络。",
    en: "Real close contacts in the live sim (same shop, queues, passing by) form a traceable network.",
  },
  title: { zh: "客流接触网络", en: "Crowd Contact Network" },
  totalNodes: { zh: "节点", en: "nodes" },
} satisfies Record<string, LocalizedText>;

export function ContactNetworkView({ network }: { network: CrowdContactNetwork }) {
  const { language } = useI18n();
  const nodeById = useMemo(
    () => new Map(network.nodes.map((node) => [node.id, node])),
    [network.nodes],
  );

  return (
    <section className="contact-network-view" aria-label={copy.title[language]}>
      <div className="contact-network-header">
        <div>
          <p className="eyebrow">{copy.contacts[language]}</p>
          <h2>{copy.title[language]}</h2>
          <p>{copy.subtitle[language]}</p>
        </div>
        <div className="contact-network-stats">
          <NetworkStat label={copy.totalNodes[language]} value={network.nodes.length} />
          <NetworkStat label={copy.edges[language]} value={network.links.length} />
        </div>
      </div>

      {network.nodes.length === 0 ? (
        <p className="contact-network-empty">{copy.empty[language]}</p>
      ) : (
        <svg
          className="contact-network-canvas"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={copy.graphLabel[language]}
        >
          <defs>
            <filter id="contact-node-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g className="contact-network-edges">
            {network.links.map((link) => {
              const source = nodeById.get(link.source);
              const target = nodeById.get(link.target);
              if (!source || !target) {
                return null;
              }
              return (
                <g key={link.id}>
                  <line
                    className="contact-edge"
                    x1={source.xPercent}
                    x2={target.xPercent}
                    y1={source.yPercent}
                    y2={target.yPercent}
                    stroke={kindColor[link.kind]}
                    style={{ strokeWidth: 0.3 + link.strength * 1.2, opacity: 0.55 }}
                  />
                  <text
                    className="contact-edge-label"
                    x={(source.xPercent + target.xPercent) / 2}
                    y={(source.yPercent + target.yPercent) / 2 - 1.1}
                  >
                    {kindLabel[link.kind][language]}
                  </text>
                </g>
              );
            })}
          </g>
          <g className="contact-network-nodes">
            {network.nodes.map((node) => {
              const color = stateColor[node.state] ?? "#4d8cff";
              return (
                <g
                  key={node.id}
                  className="contact-node"
                  transform={`translate(${node.xPercent} ${node.yPercent})`}
                >
                  <circle className="contact-node-halo" r={4} fill={color} opacity={0.16} />
                  <circle className="contact-node-core" r={2.1} fill={color} />
                  <text y={6}>
                    {node.label} · {stateLabel[node.state]?.[language] ?? node.state}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      <div className="contact-network-legend" aria-label={copy.title[language]}>
        <LegendItem color={kindColor.sameShop} label={kindLabel.sameShop[language]} />
        <LegendItem color={kindColor.queue} label={kindLabel.queue[language]} />
        <LegendItem color={kindColor.proximity} label={kindLabel.proximity[language]} />
      </div>
    </section>
  );
}

function NetworkStat({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i
        className="contact-legend-line"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
