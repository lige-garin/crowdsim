import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import {
  createValidationReport,
  renderValidationReportHtml,
} from "../analytics/validationReport";
import { ValidationReportPanel } from "./ValidationReportPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ValidationReportPanel", () => {
  /**
   * The benchmark suite (four real scenarios, thousands of physics steps)
   * used to run synchronously inside a `useMemo` during render, freezing
   * the page. It now runs in a worker (there is no real Worker in this
   * test environment, so `runValidationBenchmarksInWorker` falls back to
   * running it in-process -- same computation, same answer, just still
   * genuinely async). This test is the decisive proof that fell out of the
   * refactor: it shows a running state FIRST, before any benchmark number
   * exists to render.
   */
  it("shows a running state before the benchmark suite finishes, then the real report", async () => {
    render(
      <I18nProvider>
        <ValidationReportPanel scene={defaultDemoScene} />
      </I18nProvider>,
    );

    expect(screen.getByText(/正在跑引擎回归基准/)).toBeInTheDocument();
    expect(screen.queryByText(/通过/)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/4\/4\s+通过/)).toBeInTheDocument(), {
      timeout: 30_000,
    });
    expect(screen.getByText(/PDF-ready yes/)).toBeInTheDocument();
    expect(screen.getByText(/physics error/)).toBeInTheDocument();
    expect(screen.getByText(/校准摘要/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打印 / 导出 PDF" })).toBeInTheDocument();
  }, 30_000);

  it("opens a printable HTML report bundle", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:report");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(
      <I18nProvider>
        <ValidationReportPanel scene={defaultDemoScene} />
      </I18nProvider>,
    );

    const printButton = await screen.findByRole(
      "button",
      { name: "打印 / 导出 PDF" },
      { timeout: 30_000 },
    );
    fireEvent.click(printButton);

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(open).toHaveBeenCalledWith("blob:report", "_blank", "noopener,noreferrer");
    expect(screen.getByText("已打开报告")).toBeInTheDocument();
  }, 30_000);
});

describe("validation report for the open scene", () => {
  it("names the user's scene and carries its commercial section", async () => {
    render(
      <I18nProvider>
        <ValidationReportPanel scene={defaultDemoScene} />
      </I18nProvider>,
    );
    expect(
      await screen.findByText(/Rainy Commercial Street/, {}, { timeout: 30_000 }),
    ).toBeInTheDocument();

    const report = createValidationReport({
      commercialScene: defaultDemoScene,
      generatedAtIso: "2026-09-14T00:00:00.000Z",
    });
    const html = renderValidationReportHtml(report, "en");

    expect(html).toContain("Scene: Rainy Commercial Street");
    expect(html).toContain("Commercial behavior validation");
    expect(html).toContain("do not describe this scene");
  }, 30_000);
});
