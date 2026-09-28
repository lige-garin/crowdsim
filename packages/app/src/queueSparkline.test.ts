import { describe, expect, it } from "vitest";
import { buildQueueLengthSparkline } from "./queueSparkline";

describe("buildQueueLengthSparkline", () => {
  it("draws nothing for an empty or single-sample series", () => {
    expect(buildQueueLengthSparkline([]).points).toBe("");
    expect(buildQueueLengthSparkline([{ count: 3, t: 0 }]).points).toBe("");
  });

  it("reports the real peak, not a fixture value", () => {
    const geometry = buildQueueLengthSparkline([
      { count: 0, t: 0 },
      { count: 5, t: 10 },
      { count: 2, t: 20 },
    ]);
    expect(geometry.peak).toBe(5);
  });

  it("draws a flat line along the bottom when every sample is zero, not NaN/undefined coordinates", () => {
    const geometry = buildQueueLengthSparkline([
      { count: 0, t: 0 },
      { count: 0, t: 10 },
    ]);
    expect(geometry.points).not.toContain("NaN");
    const [, firstY] = geometry.points.split(" ")[0].split(",");
    const [, secondY] = geometry.points.split(" ")[1].split(",");
    expect(Number(firstY)).toBeCloseTo(Number(secondY), 6);
  });

  it("maps the peak sample to the top of the viewBox and a zero sample to the bottom", () => {
    const geometry = buildQueueLengthSparkline([
      { count: 0, t: 0 },
      { count: 10, t: 10 },
    ]);
    const points = geometry.points.split(" ").map((p) => p.split(",").map(Number));
    const [, y0] = points[0];
    const [, y1] = points[1];
    expect(y0).toBeGreaterThan(y1); // count=0 is lower on screen (larger y) than count=10
  });

  it("spaces samples across the x axis proportional to their real time gaps, not evenly", () => {
    const geometry = buildQueueLengthSparkline([
      { count: 1, t: 0 },
      { count: 1, t: 1 }, // close together
      { count: 1, t: 100 }, // far apart
    ]);
    const points = geometry.points.split(" ").map((p) => p.split(",").map(Number));
    const gapOne = points[1][0] - points[0][0];
    const gapTwo = points[2][0] - points[1][0];
    expect(gapTwo).toBeGreaterThan(gapOne * 10);
  });
});
