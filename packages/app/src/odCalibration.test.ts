import { describe, expect, it } from "vitest";
import {
  buildGravityOdAllocation,
  type ODDestination,
  type ODEntrance,
} from "./odEntryModel";
import { fitOdGravityParameters, odArrivalError } from "./odCalibration";

const entrances: ODEntrance[] = [
  { id: "e1", position: { x: 0, y: 0 }, inflow: 100 },
  { id: "e2", position: { x: 100, y: 0 }, inflow: 80 },
];
const destinations: ODDestination[] = [
  { id: "a", position: { x: 10, y: 0 }, attraction: 1 },
  { id: "b", position: { x: 50, y: 0 }, attraction: 2 },
  { id: "c", position: { x: 90, y: 0 }, attraction: 1.5 },
];

describe("fitOdGravityParameters", () => {
  it("recovers distanceDecay from a synthetic target", () => {
    const trueBeta = 0.12;
    const observed = buildGravityOdAllocation(entrances, destinations, {
      distanceDecay: trueBeta,
    }).destinationArrivals;

    const fit = fitOdGravityParameters(entrances, destinations, observed);

    expect(fit.distanceDecay).toBeCloseTo(trueBeta, 2);
    expect(fit.error).toBeLessThan(1e-3);
  });

  it("reduces error far below a wrong initial guess", () => {
    const observed = buildGravityOdAllocation(entrances, destinations, {
      distanceDecay: 0.12,
    }).destinationArrivals;

    const wrongError = odArrivalError(entrances, destinations, observed, {
      distanceDecay: 0.4,
    });
    const fit = fitOdGravityParameters(entrances, destinations, observed);

    expect(fit.error).toBeLessThan(wrongError * 0.05);
  });

  it("jointly recovers decay and floor penalty from multi-floor data", () => {
    const multiFloorDest: ODDestination[] = [
      { id: "g0a", position: { x: 10, y: 0 }, attraction: 1, floor: 0 },
      { id: "g0b", position: { x: 40, y: 0 }, attraction: 1.5, floor: 0 },
      { id: "g1a", position: { x: 10, y: 0 }, attraction: 1.2, floor: 1 },
      { id: "g1b", position: { x: 40, y: 0 }, attraction: 1, floor: 1 },
    ];
    const trueBeta = 0.06;
    const truePenalty = 25;
    const observed = buildGravityOdAllocation(entrances, multiFloorDest, {
      distanceDecay: trueBeta,
      floorChangePenalty: truePenalty,
    }).destinationArrivals;

    const fit = fitOdGravityParameters(entrances, multiFloorDest, observed, {
      fitFloorPenalty: true,
    });

    expect(fit.distanceDecay).toBeCloseTo(trueBeta, 2);
    expect(Math.abs(fit.floorChangePenalty - truePenalty)).toBeLessThan(5);
    expect(fit.error).toBeLessThan(1e-2);
  });
});
