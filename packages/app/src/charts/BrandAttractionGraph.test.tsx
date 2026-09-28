import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandAttractionGraph } from "./BrandAttractionGraph";
import type { BrandDecisionInsight } from "../brandDecisionProbe";

afterEach(cleanup);

const insight: BrandDecisionInsight = {
  calibration: { meanAbsoluteErrorAfter: 0.02, meanAbsoluteErrorBefore: 0.04 },
  currentIntent: "buyCoffee",
  persona: "browser",
  probabilityPercent: 64,
  reasons: [],
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
  twin: { categoryAffinity: "", inferredPersona: "commuter", observations: 2 },
};

describe("BrandAttractionGraph", () => {
  it("draws one node and one edge per candidate store, plus the hub", () => {
    const { container } = render(
      <BrandAttractionGraph insight={insight} label="graph" />,
    );

    expect(container.querySelectorAll(".brand-graph-node")).toHaveLength(2);
    expect(container.querySelectorAll(".brand-graph-link")).toHaveLength(2);
    expect(container.querySelector(".brand-graph-hub")).not.toBeNull();
  });

  it("marks only the store the decision actually picked as selected", () => {
    const { container } = render(
      <BrandAttractionGraph insight={insight} label="graph" />,
    );

    const selected = container.querySelectorAll(".brand-graph-node-selected");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toBe("64%");
  });

  it("gives the busier store a wider, more opaque edge than the quieter one", () => {
    const { container } = render(
      <BrandAttractionGraph insight={insight} label="graph" />,
    );

    const [busyEdge, quietEdge] = container.querySelectorAll(".brand-graph-link");
    const width = (el: Element) => Number(el.getAttribute("stroke-width"));
    expect(width(busyEdge)).toBeGreaterThan(width(quietEdge));
  });

  it("carries the accessible label", () => {
    render(<BrandAttractionGraph insight={insight} label="Brand attraction field" />);
    expect(
      screen.getByRole("img", { name: "Brand attraction field" }),
    ).toBeInTheDocument();
  });
});
