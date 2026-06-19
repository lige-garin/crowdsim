import { describe, expect, it } from "vitest";
import { createDashboardV2Stats } from "./dashboardV2Stats";

describe("dashboard v2 stats", () => {
  it("calculates shop conversion, queue curve, flow and trajectory replay", () => {
    const stats = createDashboardV2Stats({
      heatmapSamples: [
        {
          elapsedSeconds: 20,
          agents: [
            { id: 1, x: 10.25, y: 4.5 },
            { id: 2, x: 12, y: 8.75 },
          ],
        },
      ],
      queueThroughput: 20,
      samples: [
        { elapsedSeconds: 0, agentCount: 10, exitedCount: 1 },
        { elapsedSeconds: 10, agentCount: 20, exitedCount: 4 },
        { elapsedSeconds: 20, agentCount: 24, exitedCount: 9 },
      ],
      shopDecisionSummary: "Browser -> anchor p=0.50 dwell=790s capacity=20",
    });

    expect(stats.shopEntryRatePercent).toBe(50);
    expect(stats.queueLengthSeries.at(-1)?.queueLength).toBe(5);
    expect(stats.crossSectionFlowPerMinute).toBe(24);
    expect(stats.trajectoryReplay.zh).toBe("1@10.3,4.5 | 2@12.0,8.8");
    expect(stats.trajectoryReplay.en).toBe("1@10.3,4.5 | 2@12.0,8.8");
    expect(stats.summary.zh).toContain("选店概率 50%");
    expect(stats.summary.en).toContain("Store-choice 50%");
  });
});
