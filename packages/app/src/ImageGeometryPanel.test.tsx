import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageGeometryPanel } from "./ImageGeometryPanel";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ImageGeometryPanel", () => {
  it("renders image tracing evaluation readiness", () => {
    render(
      <I18nProvider>
        <ImageGeometryPanel />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "图片描图（示例）" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/fixtures 3/)).toBeInTheDocument();
    expect(screen.getByText(/low-confidence review/)).toBeInTheDocument();
  });
});
