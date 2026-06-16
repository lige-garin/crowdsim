import type { Language } from "./i18n";

type AppHomeProps = {
  language: Language;
  onEnterLab: () => void;
  onOpenNetwork: () => void;
  onSetLanguage: (language: Language) => void;
  runState: string;
  webGpuStatus: string;
};

type HomeCopy = {
  graphLabel: string;
  kicker: string;
  lab: string;
  languageLabel: string;
  networkAction: string;
  pageLabel: string;
  primaryAction: string;
  statusLabel: string;
  subtitle: string;
  title: string;
};

const homeCopy: Record<Language, HomeCopy> = {
  zh: {
    graphLabel: "商业客流网络预览",
    kicker: "商业客流运营套件",
    lab: "商业客流操作系统",
    languageLabel: "语言",
    networkAction: "查看接触网络",
    pageLabel: "CrowdSim 首页",
    primaryAction: "进入运营台",
    statusLabel: "运行摘要",
    subtitle: "把客流仿真、品牌吸引、接触网络和验证报告放进一个可交付的商业运营台。",
    title: "CrowdSim Operations",
  },
  en: {
    graphLabel: "Commercial flow network preview",
    kicker: "Commercial operations suite",
    lab: "Commercial crowd operating system",
    languageLabel: "Language",
    networkAction: "View network",
    pageLabel: "CrowdSim home",
    primaryAction: "Open console",
    statusLabel: "Run summary",
    subtitle:
      "Simulation, brand pull, contact networks, and validation reports in one client-ready operating console.",
    title: "CrowdSim Operations",
  },
};

const nodes = [
  { id: "D01", x: 132, y: 176, size: 15, tone: "cyan" },
  { id: "P07", x: 250, y: 112, size: 12, tone: "blue" },
  { id: "P12", x: 352, y: 188, size: 18, tone: "acid" },
  { id: "N04", x: 492, y: 126, size: 11, tone: "cyan" },
  { id: "P21", x: 170, y: 326, size: 12, tone: "blue" },
  { id: "G03", x: 326, y: 314, size: 16, tone: "cyan" },
  { id: "P33", x: 504, y: 292, size: 13, tone: "blue" },
  { id: "EVD", x: 420, y: 390, size: 10, tone: "acid" },
];

const links = [
  ["D01", "P12", "care"],
  ["P07", "P12", "proximity"],
  ["P12", "N04", "care"],
  ["D01", "P21", "group"],
  ["P21", "G03", "group"],
  ["G03", "P33", "proximity"],
  ["P12", "G03", "care"],
  ["P33", "EVD", "evidence"],
] as const;

function findNode(id: string) {
  const node = nodes.find((candidate) => candidate.id === id);

  if (!node) {
    throw new Error(`Unknown home graph node: ${id}`);
  }

  return node;
}

export function AppHome({
  language,
  onEnterLab,
  onOpenNetwork,
  onSetLanguage,
  runState,
  webGpuStatus,
}: AppHomeProps) {
  const copy = homeCopy[language];
  const pulses = [
    { label: "SIM", value: runState },
    { label: "GPU", value: webGpuStatus },
    { label: "TRACE", value: "AI" },
    { label: "DATA", value: "D1/R2" },
  ];

  return (
    <main id="main-content" className="home-shell" aria-label={copy.pageLabel}>
      <header className="home-topbar">
        <div className="home-brand">
          <span>CrowdSim</span>
          <strong>{copy.lab}</strong>
        </div>
        <div className="home-language" aria-label={copy.languageLabel}>
          <button
            type="button"
            aria-pressed={language === "zh"}
            onClick={() => onSetLanguage("zh")}
          >
            中文
          </button>
          <button
            type="button"
            aria-pressed={language === "en"}
            onClick={() => onSetLanguage("en")}
          >
            EN
          </button>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <p className="home-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
          <div className="home-actions">
            <button type="button" className="home-primary" onClick={onEnterLab}>
              {copy.primaryAction}
            </button>
            <button type="button" className="home-secondary" onClick={onOpenNetwork}>
              {copy.networkAction}
            </button>
          </div>
        </div>

        <div className="home-visual-panel">
          <div className="home-visual-top">
            <span>OPERATIONS NETWORK</span>
            <span>LIVE CAPACITY MODEL</span>
          </div>
          <svg
            className="home-network"
            viewBox="0 0 640 460"
            role="img"
            aria-label={copy.graphLabel}
          >
            <defs>
              <linearGradient id="homeEdgeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#005bff" />
                <stop offset="52%" stopColor="#00b7ff" />
                <stop offset="100%" stopColor="#c8ff2d" />
              </linearGradient>
            </defs>
            <g className="home-grid-lines">
              {Array.from({ length: 6 }, (_, index) => (
                <line
                  key={`h-${index}`}
                  x1="52"
                  x2="588"
                  y1={72 + index * 62}
                  y2={72 + index * 62}
                />
              ))}
              {Array.from({ length: 7 }, (_, index) => (
                <line
                  key={`v-${index}`}
                  x1={68 + index * 82}
                  x2={68 + index * 82}
                  y1="54"
                  y2="414"
                />
              ))}
            </g>
            <g className="home-links">
              {links.map(([sourceId, targetId, tone]) => {
                const source = findNode(sourceId);
                const target = findNode(targetId);

                return (
                  <line
                    key={`${sourceId}-${targetId}`}
                    className={`home-link home-link-${tone}`}
                    x1={source.x}
                    x2={target.x}
                    y1={source.y}
                    y2={target.y}
                  />
                );
              })}
            </g>
            <g className="home-nodes">
              {nodes.map((node) => (
                <g key={node.id} className={`home-node home-node-${node.tone}`}>
                  <circle cx={node.x} cy={node.y} r={node.size + 8} />
                  <circle cx={node.x} cy={node.y} r={node.size} />
                  <text x={node.x} y={node.y + node.size + 23}>
                    {node.id}
                  </text>
                </g>
              ))}
            </g>
          </svg>
          <div className="home-rail" aria-label={copy.statusLabel}>
            {pulses.map((pulse) => (
              <article key={pulse.label}>
                <span>{pulse.label}</span>
                <strong>{pulse.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
