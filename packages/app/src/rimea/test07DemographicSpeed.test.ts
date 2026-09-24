import { describe, expect, it } from "vitest";
import {
  demographicSpeedTest,
  runDemographicSpeedTest,
} from "./test07DemographicSpeed";

describe("test 7: allocation of demographic parameters", () => {
  it("puts Fig. 3's own mean inside the 95% bootstrap interval of 50 realised speeds", () => {
    const result = runDemographicSpeedTest();

    expect(result.number).toBe(7);
    expect(result.status).toBe("pass");
    expect(result.measured).toMatch(
      /50 realised speeds: mean [\d.]+ m\/s, sd [\d.]+ m\/s/u,
    );
    expect(result.measured).toMatch(/95% bootstrap interval/u);
    expect(result.criterion).toContain(
      `${demographicSpeedTest.meanSpeedMetersPerSecond} m/s`,
    );
    expect(result.criterion).toContain("age 30");
  }, 60_000);
});
