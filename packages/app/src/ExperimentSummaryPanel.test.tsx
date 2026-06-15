import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExperimentSummaryPanel } from "./ExperimentSummaryPanel";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ExperimentSummaryPanel", () => {
  it("renders the default Monte Carlo speed comparison", () => {
    render(
      <I18nProvider>
        <ExperimentSummaryPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "实验 Runner" })).toBeInTheDocument();
    expect(screen.getByText("基线")).toBeInTheDocument();
    expect(screen.getByText("慢速人群")).toBeInTheDocument();
    expect(screen.getAllByText(/\/min/)).toHaveLength(2);
  });
});
