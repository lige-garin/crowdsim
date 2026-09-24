import { describe, expect, it } from "vitest";
import { largeRoomTest, runLargePublicSpaceTest } from "./test09LargePublicSpace";

describe("test 9: crowd leaving a large public space", () => {
  it("clears faster through four doors than through two, cheaply", () => {
    const result = runLargePublicSpaceTest({ people: 40 });

    expect(result.number).toBe(9);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/four doors .* two doors/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 4 test 9");
    // The router's own gap-size workaround, not a claim about door width.
    expect(result.criterion).toContain("routing grid");
  }, 30_000);

  it("repeats: the same build gives the same answer", () => {
    expect(runLargePublicSpaceTest({ people: 20 })).toEqual(
      runLargePublicSpaceTest({ people: 20 }),
    );
  }, 30_000);

  it("uses the guideline's own 20 m room, at 1000 people by default", () => {
    expect(largeRoomTest.roomSizeMeters).toBe(20);
    expect(largeRoomTest.people).toBe(1000);
  });
});
