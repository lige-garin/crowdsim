import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n";
import { bioCityDemoScene } from "./bioCityDemoScene";
import { createValidationReport, renderValidationReportHtml } from "./validationReport";
import { ValidationReportPanel } from "./ValidationReportPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ValidationReportPanel", () => {
  it("summarizes the M5 calibration report export bundle", () => {
    render(
      <I18nProvider>
        <ValidationReportPanel scene={bioCityDemoScene} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "校准报告" })).toBeInTheDocument();
    expect(screen.getByText(/4\/4\s+通过/)).toBeInTheDocument();
    expect(screen.getByText(/PDF-ready yes/)).toBeInTheDocument();
    expect(screen.getByText(/physics error/)).toBeInTheDocument();
    expect(screen.getByText(/校准摘要/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打印 / 导出 PDF" })).toBeInTheDocument();
  });

  it("opens a printable HTML report bundle", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:report");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(
      <I18nProvider>
        <ValidationReportPanel scene={bioCityDemoScene} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打印 / 导出 PDF" }));

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(open).toHaveBeenCalledWith("blob:report", "_blank", "noopener,noreferrer");
    expect(screen.getByText("已打开报告")).toBeInTheDocument();
  });
});

describe("validation report for the open scene", () => {
  it("names the user's scene and carries its commercial section", () => {
    render(
      <I18nProvider>
        <ValidationReportPanel scene={bioCityDemoScene} />
      </I18nProvider>,
    );
    expect(screen.getByText(/BioCity Rainy High Street/)).toBeInTheDocument();

    const report = createValidationReport({
      commercialScene: bioCityDemoScene,
      generatedAtIso: "2026-09-14T00:00:00.000Z",
    });
    const html = renderValidationReportHtml(report, "en");

    expect(html).toContain("Scene: BioCity Rainy High Street");
    expect(html).toContain("Commercial behavior validation");
    expect(html).toContain("do not describe this scene");
  }, 20_000);
});
