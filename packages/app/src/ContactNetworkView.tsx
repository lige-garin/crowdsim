import { useMemo } from "react";
import { useI18n, type Language, type LocalizedText } from "./i18n";

type ContactRole = "doctor" | "family" | "nurse" | "patient" | "visitor";
type ContactLinkKind = "care" | "group" | "proximity";

type ContactNode = {
  id: string;
  label: LocalizedText;
  role: ContactRole;
  x: number;
  y: number;
};

type ContactLink = {
  id: string;
  kind: ContactLinkKind;
  label: LocalizedText;
  source: string;
  strength: number;
  target: string;
};

const copy = {
  care: { zh: "诊疗接触", en: "doctor visit" },
  contacts: { zh: "接触", en: "contacts" },
  edges: { zh: "连线", en: "links" },
  group: { zh: "同行关系", en: "traveling together" },
  graphLabel: { zh: "接触网络图", en: "Contact network graph" },
  legend: { zh: "接触连线图例", en: "Contact link legend" },
  proximity: { zh: "近距离接触", en: "close contact" },
  subtitle: {
    zh: "同行、诊疗和近距离接触都会留下边，形成可追踪的人际网络。",
    en: "Companions, care visits, and close contact leave traceable network edges.",
  },
  title: { zh: "接触网络", en: "Contact Network" },
  totalNodes: { zh: "节点", en: "nodes" },
} satisfies Record<string, LocalizedText>;

const contactNetworkNodes: readonly ContactNode[] = [
  {
    id: "doctor-chen",
    label: { zh: "陈医生", en: "Dr. Chen" },
    role: "doctor",
    x: 50,
    y: 12,
  },
  {
    id: "nurse-li",
    label: { zh: "李护士", en: "Nurse Li" },
    role: "nurse",
    x: 70,
    y: 24,
  },
  {
    id: "patient-17",
    label: { zh: "病人 P-17", en: "Patient P-17" },
    role: "patient",
    x: 42,
    y: 33,
  },
  {
    id: "family-17",
    label: { zh: "家属 F-17", en: "Family F-17" },
    role: "family",
    x: 24,
    y: 44,
  },
  {
    id: "patient-23",
    label: { zh: "病人 P-23", en: "Patient P-23" },
    role: "patient",
    x: 68,
    y: 45,
  },
  {
    id: "visitor-02",
    label: { zh: "陪诊 V-02", en: "Visitor V-02" },
    role: "visitor",
    x: 83,
    y: 34,
  },
  {
    id: "patient-31",
    label: { zh: "病人 P-31", en: "Patient P-31" },
    role: "patient",
    x: 32,
    y: 17,
  },
  {
    id: "doctor-wang",
    label: { zh: "王医生", en: "Dr. Wang" },
    role: "doctor",
    x: 15,
    y: 26,
  },
];

const contactNetworkLinks: readonly ContactLink[] = [
  {
    id: "care-chen-p17",
    kind: "care",
    label: copy.care,
    source: "doctor-chen",
    strength: 0.95,
    target: "patient-17",
  },
  {
    id: "care-chen-p23",
    kind: "care",
    label: copy.care,
    source: "doctor-chen",
    strength: 0.72,
    target: "patient-23",
  },
  {
    id: "care-wang-p31",
    kind: "care",
    label: copy.care,
    source: "doctor-wang",
    strength: 0.88,
    target: "patient-31",
  },
  {
    id: "nurse-p17",
    kind: "care",
    label: { zh: "护理接触", en: "nursing contact" },
    source: "nurse-li",
    strength: 0.68,
    target: "patient-17",
  },
  {
    id: "group-p17-family",
    kind: "group",
    label: copy.group,
    source: "patient-17",
    strength: 0.9,
    target: "family-17",
  },
  {
    id: "group-p23-visitor",
    kind: "group",
    label: copy.group,
    source: "patient-23",
    strength: 0.84,
    target: "visitor-02",
  },
  {
    id: "close-p23-visitor",
    kind: "proximity",
    label: copy.proximity,
    source: "nurse-li",
    strength: 0.55,
    target: "visitor-02",
  },
  {
    id: "close-p17-p31",
    kind: "proximity",
    label: copy.proximity,
    source: "patient-17",
    strength: 0.48,
    target: "patient-31",
  },
];

export function ContactNetworkView() {
  const { language } = useI18n();
  const nodeById = useMemo(
    () => new Map(contactNetworkNodes.map((node) => [node.id, node])),
    [],
  );
  const counts = useMemo(
    () => ({
      care: contactNetworkLinks.filter((link) => link.kind === "care").length,
      group: contactNetworkLinks.filter((link) => link.kind === "group").length,
      proximity: contactNetworkLinks.filter((link) => link.kind === "proximity").length,
    }),
    [],
  );

  return (
    <section className="contact-network-view" aria-label={localize("title", language)}>
      <div className="contact-network-header">
        <div>
          <p className="eyebrow">{localize("contacts", language)}</p>
          <h2>{localize("title", language)}</h2>
          <p>{localize("subtitle", language)}</p>
        </div>
        <div className="contact-network-stats">
          <NetworkStat
            label={localize("totalNodes", language)}
            value={contactNetworkNodes.length}
          />
          <NetworkStat
            label={localize("edges", language)}
            value={contactNetworkLinks.length}
          />
          <NetworkStat label={localize("care", language)} value={counts.care} />
        </div>
      </div>

      <svg
        className="contact-network-canvas"
        viewBox="0 0 100 64"
        role="img"
        aria-label={localize("graphLabel", language)}
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
          {contactNetworkLinks.map((link) => {
            const source = nodeById.get(link.source);
            const target = nodeById.get(link.target);

            if (!source || !target) {
              return null;
            }

            return (
              <g key={link.id}>
                <line
                  className={`contact-edge contact-edge-${link.kind}`}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                  style={{ strokeWidth: 0.35 + link.strength * 1.35 }}
                />
                <text
                  className="contact-edge-label"
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 1.2}
                >
                  {link.label[language]}
                </text>
              </g>
            );
          })}
        </g>
        <g className="contact-network-nodes">
          {contactNetworkNodes.map((node) => (
            <g
              key={node.id}
              className={`contact-node contact-node-${node.role}`}
              transform={`translate(${node.x} ${node.y})`}
            >
              <circle className="contact-node-halo" r={4.4} />
              <circle className="contact-node-core" r={2.4} />
              <text y={6.7}>{node.label[language]}</text>
            </g>
          ))}
        </g>
      </svg>

      <div className="contact-network-legend" aria-label={localize("legend", language)}>
        <LegendItem kind="care" label={localize("care", language)} />
        <LegendItem kind="group" label={localize("group", language)} />
        <LegendItem kind="proximity" label={localize("proximity", language)} />
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

function LegendItem({ kind, label }: { kind: ContactLinkKind; label: string }) {
  return (
    <span>
      <i className={`contact-legend-line contact-legend-line-${kind}`} />
      {label}
    </span>
  );
}

function localize(key: keyof typeof copy, language: Language) {
  return copy[key][language];
}
