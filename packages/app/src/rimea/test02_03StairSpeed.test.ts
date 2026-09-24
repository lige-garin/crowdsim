import { describe, expect, it } from "vitest";
import { runStairSpeedTest } from "./test02_03StairSpeed";

describe("tests 2 and 3: walking speed on stairs", () => {
  it("crosses the flight up in about the time its own stair speed implies", () => {
    const result = runStairSpeedTest("up");

    expect(result.number).toBe(2);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(/median .* s over \d+ walks/u);
    expect(result.criterion).toContain("RiMEA 4.1.1 A 2 test 2");
    // The window is this project's own extrapolation, not RiMEA's text, and
    // the criterion says so.
    expect(result.criterion).toContain("extrapolation");
  }, 60_000);

  it("crosses the flight down in about the time its own stair speed implies", () => {
    const result = runStairSpeedTest("down");

    expect(result.number).toBe(3);
    expect(result.status).toBe("pass");
    expect(result.criterion).toContain("RiMEA 4.1.1 A 2 test 3");
  }, 60_000);

  it("takes longer down a metre-for-metre flight than up, at this project's own speeds", () => {
    // Weidmann: 0.694 m/s down against 0.61 up (floorRouting.connectorSpeeds)
    // — the same asymmetry the level model has no equivalent of.
    const up = runStairSpeedTest("up");
    const down = runStairSpeedTest("down");
    const medianOf = (measured: string | undefined) =>
      Number(measured?.match(/median ([\d.]+) s/u)?.[1]);

    expect(medianOf(down.measured)).toBeLessThan(medianOf(up.measured));
  }, 60_000);
});
