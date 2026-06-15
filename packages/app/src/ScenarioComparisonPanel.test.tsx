import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScenarioComparisonPanel } from "./ScenarioComparisonPanel";
import { I18nProvider } from "./i18n";

describe("ScenarioComparisonPanel", () => {
  it("renders side-by-side scenario metrics", () => {
    render(
      <I18nProvider>
        <ScenarioComparisonPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "方案对比" })).toBeInTheDocument();
    expect(screen.getByText("基线")).toBeInTheDocument();
    expect(screen.getByText("出口加宽")).toBeInTheDocument();
  });
});
