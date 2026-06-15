import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";

describe("TemplateLibraryPanel", () => {
  it("renders six industry templates and recommended parameters", () => {
    render(
      <I18nProvider>
        <TemplateLibraryPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "行业模板库" })).toBeInTheDocument();
    expect(screen.getByText("Airport Security Checkpoint")).toBeInTheDocument();
    expect(screen.getByText("Hospital Outpatient Clinic")).toBeInTheDocument();
    expect(screen.getByText("Stadium Concourse")).toBeInTheDocument();
    expect(screen.getAllByText(/\/min/)).toHaveLength(6);
  });
});
