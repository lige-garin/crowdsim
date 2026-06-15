import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExperimentSweepPanel } from "./ExperimentSweepPanel";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ExperimentSweepPanel", () => {
  it("renders sweep and p95 readiness", () => {
    render(
      <I18nProvider>
        <ExperimentSweepPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "参数扫描" })).toBeInTheDocument();
    expect(screen.getByText(/variants 3/)).toBeInTheDocument();
    expect(screen.getByText(/p95/)).toBeInTheDocument();
    expect(screen.getByText(/worker headless-no-render/)).toBeInTheDocument();
    expect(screen.getByText(/serial/)).toBeInTheDocument();
  });
});
