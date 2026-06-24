import { describe, expect, it } from "vitest";
import {
  buildGravityOdAllocation,
  type ODDestination,
  type ODEntrance,
} from "./odEntryModel";
import { summarizeOdFlows } from "./odFlowAnalysis";

const entrances: ODEntrance[] = [
  { id: "north", position: { x: 0, y: 0 }, inflow: 120 },
  { id: "south", position: { x: 0, y: 100 }, inflow: 80 },
];
const destinations: ODDestination[] = [
  { id: "anchor", position: { x: 50, y: 50 }, attraction: 3 },
  { id: "cafe", position: { x: 10, y: 10 }, attraction: 1 },
  { id: "kiosk", position: { x: 90, y: 90 }, attraction: 0.5 },
];

const allocation = buildGravityOdAllocation(entrances, destinations, {
  distanceDecay: 0.03,
});

describe("summarizeOdFlows", () => {
  it("ranks entrance->destination edges by flow, descending", () => {
    const summary = summarizeOdFlows(allocation);
    for (let i = 1; i < summary.flows.length; i++) {
      expect(summary.flows[i - 1].flow).toBeGreaterThanOrEqual(summary.flows[i].flow);
    }
    // 2 entrances x 3 destinations
    expect(summary.flows).toHaveLength(6);
  });

  it("conserves flow and shares sum to one", () => {
    const summary = summarizeOdFlows(allocation);
    const flowSum = summary.flows.reduce((s, edge) => s + edge.flow, 0);
    expect(flowSum).toBeCloseTo(200, 6);
    expect(summary.totalFlow).toBeCloseTo(200, 6);
    const shareSum = summary.flows.reduce((s, edge) => s + edge.share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
  });

  it("limits to the top-N edges when requested", () => {
    const summary = summarizeOdFlows(allocation, { topN: 3 });
    expect(summary.flows).toHaveLength(3);
    // still the three largest, descending
    const all = summarizeOdFlows(allocation).flows.slice(0, 3);
    expect(summary.flows.map((e) => e.flow)).toEqual(all.map((e) => e.flow));
  });

  it("ranks destinations by total arrivals, descending and matching the allocation", () => {
    const summary = summarizeOdFlows(allocation);
    for (let i = 1; i < summary.destinationRanking.length; i++) {
      expect(summary.destinationRanking[i - 1].arrivals).toBeGreaterThanOrEqual(
        summary.destinationRanking[i].arrivals,
      );
    }
    for (const row of summary.destinationRanking) {
      expect(row.arrivals).toBeCloseTo(
        allocation.destinationArrivals[row.destinationId],
        6,
      );
    }
    // the high-attraction anchor should top the ranking
    expect(summary.destinationRanking[0].destinationId).toBe("anchor");
  });

  it("is deterministic", () => {
    expect(summarizeOdFlows(allocation)).toEqual(summarizeOdFlows(allocation));
  });
});
