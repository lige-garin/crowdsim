import type { ODAllocation } from "./odEntryModel";

// Retail-first plan §4 P4 analytics data layer: turn a gravity OD allocation into
// ranked origin->destination flow edges (sankey / arc rendering) and a destination
// arrival ranking. This is the decision-level "OD 动线" data a panel renders;
// panel UI wiring is separate. Pure + deterministic (stable tie-break by id).

export type OdFlowEdge = {
  entranceId: string;
  destinationId: string;
  flow: number;
  share: number;
};

export type OdDestinationRank = {
  destinationId: string;
  arrivals: number;
};

export type OdFlowSummary = {
  flows: OdFlowEdge[];
  destinationRanking: OdDestinationRank[];
  totalFlow: number;
};

export function summarizeOdFlows(
  allocation: ODAllocation,
  options: { topN?: number } = {},
): OdFlowSummary {
  const totalFlow = allocation.totalInflow;

  const edges: OdFlowEdge[] = [];
  for (const [entranceId, rows] of Object.entries(allocation.byEntrance)) {
    for (const row of rows) {
      edges.push({
        entranceId,
        destinationId: row.destinationId,
        flow: row.expectedFlow,
        share: totalFlow > 0 ? row.expectedFlow / totalFlow : 0,
      });
    }
  }

  edges.sort((a, b) => {
    if (b.flow !== a.flow) {
      return b.flow - a.flow;
    }
    if (a.entranceId !== b.entranceId) {
      return a.entranceId < b.entranceId ? -1 : 1;
    }
    return a.destinationId < b.destinationId ? -1 : a.destinationId > b.destinationId ? 1 : 0;
  });

  const destinationRanking: OdDestinationRank[] = Object.entries(
    allocation.destinationArrivals,
  )
    .map(([destinationId, arrivals]) => ({ destinationId, arrivals }))
    .sort((a, b) => {
      if (b.arrivals !== a.arrivals) {
        return b.arrivals - a.arrivals;
      }
      return a.destinationId < b.destinationId ? -1 : a.destinationId > b.destinationId ? 1 : 0;
    });

  return {
    flows: options.topN != null ? edges.slice(0, options.topN) : edges,
    destinationRanking,
    totalFlow,
  };
}
