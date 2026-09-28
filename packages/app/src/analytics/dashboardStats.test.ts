import { describe, expect, it } from "vitest";
import { createDashboardStats } from "./dashboardStats";

describe("dashboard stats", () => {
  it("summarizes live population and running evacuation output", () => {
    const stats = createDashboardStats({
      densityPeak: 7,
      evacuationActive: true,
      evacuationCurve: [
        { elapsedSeconds: 0, exited: 0, remaining: 12 },
        { elapsedSeconds: 8.4, exited: 5, remaining: 7 },
      ],
      samples: [
        { elapsedSeconds: 0, agentCount: 12, exitedCount: 0 },
        { elapsedSeconds: 8.4, agentCount: 7, exitedCount: 5 },
      ],
    });

    expect(stats.currentAgentCount).toBe(7);
    expect(stats.densityPeak).toBe(7);
    expect(stats.evacuationStatus).toBe("running");
    expect(stats.evacuationElapsedSeconds).toBe(8.4);
    expect(stats.summary).toEqual({
      zh: "人数 7 | 已离开 5 | 密度峰值 7 | 疏散 进行中 8s",
      en: "Agents 7 | Exited 5 | Peak density 7 | Evacuation running 8s",
    });
  });

  it("reports evacuation completion time when remaining reaches zero", () => {
    const stats = createDashboardStats({
      densityPeak: 3,
      evacuationActive: true,
      evacuationCurve: [
        { elapsedSeconds: 0, exited: 0, remaining: 4 },
        { elapsedSeconds: 13.2, exited: 4, remaining: 0 },
      ],
      samples: [{ elapsedSeconds: 13.2, agentCount: 0, exitedCount: 4 }],
    });

    expect(stats.evacuationStatus).toBe("complete");
    expect(stats.evacuationCompletionSeconds).toBe(13.2);
    expect(stats.summary.zh).toContain("疏散 完成 13s");
    expect(stats.summary.en).toContain("Evacuation complete 13s");
  });
});
