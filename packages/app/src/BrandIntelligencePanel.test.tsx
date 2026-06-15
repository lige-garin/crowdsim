import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BrandDecisionInsight } from "./brandDecisionProbe";
import { BrandIntelligencePanel } from "./BrandIntelligencePanel";
import { I18nProvider } from "./i18n";

describe("BrandIntelligencePanel", () => {
  it("renders brand choice, persona, ranked stores and reasons", () => {
    render(
      <I18nProvider>
        <BrandIntelligencePanel insight={sampleInsight} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "品牌智能体" })).toBeInTheDocument();
    expect(screen.getByText("browser")).toBeInTheDocument();
    expect(screen.getAllByText("Coffee Pulse").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "品牌吸引场" })).toBeInTheDocument();
    expect(screen.getByText("brand affinity +0.42")).toBeInTheDocument();
    expect(screen.getByText("coffee:0.71 | fastFashion:0.43")).toBeInTheDocument();
  });

  it("renders an empty state while probes are loading", () => {
    render(
      <I18nProvider>
        <BrandIntelligencePanel />
      </I18nProvider>,
    );

    expect(screen.getByText("等待品牌吸引力探针")).toBeInTheDocument();
  });
});

const sampleInsight: BrandDecisionInsight = {
  calibration: {
    meanAbsoluteErrorAfter: 0.02,
    meanAbsoluteErrorBefore: 0.04,
  },
  currentIntent: "buyCoffee",
  persona: "browser",
  probabilityPercent: 64,
  reasons: ["brand affinity +0.42", "distance cost -0.08"],
  score: 0.82,
  selectedBrandName: "Coffee Pulse",
  selectedCategory: "coffee",
  selectedStoreId: "coffee-pulse",
  topStores: [
    {
      category: "coffee",
      id: "coffee-pulse",
      name: "Coffee Pulse",
      probabilityPercent: 64,
      score: 0.82,
    },
    {
      category: "fastFashion",
      id: "mono-thread",
      name: "Mono Thread",
      probabilityPercent: 24,
      score: 0.38,
    },
  ],
  twin: {
    categoryAffinity: "coffee:0.71 | fastFashion:0.43",
    inferredPersona: "commuter",
    observations: 2,
  },
};
