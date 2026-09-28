import type { BrandDecisionInsight } from "../brandDecisionProbe";

const width = 260;
const height = 160;
const centerX = width / 2;
const centerY = height / 2;
const ringRadius = 62;

/**
 * The customer as a hub, each candidate store as a spoke: edge width and
 * node size both scale with that store's attraction probability, the
 * store the decision actually picked is drawn in the accent colour. This
 * replaces a row of plain circles with the force-directed-graph look the
 * home screen and the contact network already establish elsewhere in this
 * app (glow halo + core circle, gradient edges) -- reused here because it
 * is a real "neural network diagram" of this decision, not decoration.
 */
export function BrandAttractionGraph({
  insight,
  label,
}: {
  insight: BrandDecisionInsight;
  label: string;
}) {
  const stores = insight.topStores;
  const positions = stores.map((store, index) => {
    const angle = (index / Math.max(1, stores.length)) * Math.PI * 2 - Math.PI / 2;
    return {
      store,
      x: centerX + Math.cos(angle) * ringRadius,
      y: centerY + Math.sin(angle) * ringRadius,
    };
  });

  return (
    <svg
      className="brand-attraction-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="brandGraphEdge" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#f2a93b" />
          <stop offset="100%" stopColor="#2fd0ff" />
        </linearGradient>
      </defs>
      <g className="brand-graph-links">
        {positions.map(({ store, x, y }) => (
          <line
            key={store.id}
            className="brand-graph-link"
            x1={centerX}
            x2={x}
            y1={centerY}
            y2={y}
            strokeWidth={0.6 + store.probabilityPercent / 22}
            strokeOpacity={0.25 + store.probabilityPercent / 140}
          />
        ))}
      </g>
      <g className="brand-graph-nodes">
        {positions.map(({ store, x, y }) => {
          const radius = 6 + store.probabilityPercent * 0.14;
          const selected = store.id === insight.selectedStoreId;

          return (
            <g
              key={store.id}
              className={`brand-graph-node${selected ? " brand-graph-node-selected" : ""}`}
            >
              <circle cx={x} cy={y} r={radius + 5} className="brand-graph-node-halo" />
              <circle cx={x} cy={y} r={radius} className="brand-graph-node-core" />
              <text x={x} y={y + radius + 12}>
                {store.probabilityPercent}%
              </text>
            </g>
          );
        })}
      </g>
      <g className="brand-graph-hub">
        <circle cx={centerX} cy={centerY} r={13} className="brand-graph-hub-halo" />
        <circle cx={centerX} cy={centerY} r={7} className="brand-graph-hub-core" />
      </g>
    </svg>
  );
}
