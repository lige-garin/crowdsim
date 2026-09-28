import { useMemo } from "react";
import { useI18n, type LocalizedText } from "../i18n";
import type {
  CrowdContactLink,
  CrowdContactNetwork,
} from "../engine/crowdContactNetwork";

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
  const positionedNodes = useMemo(() => positionContactNodes(network), [network]);
  const nodeById = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );
  const labeledLinks = useMemo(
    () =>
      new Set(
        [...network.links]
          .sort((left, right) => right.strength - left.strength)
          .slice(0, 6)
          .map((link) => link.id),
      ),
    [network.links],
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
                    x1={source.x}
                    x2={target.x}
                    y1={source.y}
                    y2={target.y}
                    stroke={kindColor[link.kind]}
                    style={{ strokeWidth: 0.3 + link.strength * 1.2, opacity: 0.55 }}
                  />
                  {labeledLinks.has(link.id) && (
                    <text
                      className="contact-edge-label"
                      x={(source.x + target.x) / 2}
                      y={(source.y + target.y) / 2 - 1.1}
                    >
                      {kindLabel[link.kind][language]}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g className="contact-network-nodes">
            {positionedNodes.map((node) => {
              const color = stateColor[node.state] ?? "#4d8cff";
              return (
                <g
                  key={node.id}
                  className="contact-node"
                  transform={`translate(${node.x} ${node.y})`}
                >
                  <circle
                    className="contact-node-halo"
                    r={5.8}
                    fill={color}
                    opacity={0.16}
                  />
                  <circle className="contact-node-core" r={2.7} fill={color} />
                  <text y={8.2}>
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

type PositionedContactNode = CrowdContactNetwork["nodes"][number] & {
  degree: number;
  x: number;
  y: number;
};

function positionContactNodes(network: CrowdContactNetwork): PositionedContactNode[] {
  const degreeById = new Map(network.nodes.map((node) => [node.id, 0]));

  for (const link of network.links) {
    degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
    degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
  }

  const sorted = [...network.nodes].sort((left, right) => {
    const degreeDelta =
      (degreeById.get(right.id) ?? 0) - (degreeById.get(left.id) ?? 0);
    return degreeDelta || left.id.localeCompare(right.id);
  });

  return sorted.map((node, index) => {
    const degree = degreeById.get(node.id) ?? 0;
    if (index === 0) {
      return { ...node, degree, x: 50, y: 52 };
    }

    const ringIndex = index - 1;
    const innerCount = Math.min(6, sorted.length - 1);
    const outerCount = Math.max(1, sorted.length - 1 - innerCount);
    const inner = ringIndex < innerCount;
    const slot = inner ? ringIndex : ringIndex - innerCount;
    const count = inner ? innerCount : outerCount;
    const angle = -Math.PI / 2 + (slot / count) * Math.PI * 2 + (inner ? 0 : 0.28);
    const radius = inner ? 31 : 42;

    return {
      ...node,
      degree,
      x: clampNetworkCoord(50 + Math.cos(angle) * radius, 9, 91),
      y: clampNetworkCoord(52 + Math.sin(angle) * radius * 0.78, 12, 89),
    };
  });
}

function clampNetworkCoord(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
      <i className="contact-legend-line" style={{ background: color }} />
      {label}
    </span>
  );
}
