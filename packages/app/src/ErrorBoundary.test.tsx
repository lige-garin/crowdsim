import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./ErrorBoundary";

afterEach(() => {
  cleanup();
});

function Kaboom(): never {
  throw new Error("kaboom");
}

describe("AppErrorBoundary", () => {
  it("renders a readable fallback instead of a white screen when a child throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <AppErrorBoundary>
          <Kaboom />
        </AppErrorBoundary>,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      // Bilingual by design: the i18n provider may itself be part of the crash.
      expect(screen.getByText(/界面出现错误/)).toBeInTheDocument();
      expect(screen.getByText(/could not recover from this error/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /刷新页面 · Reload/ }),
      ).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs the caught error so it is not swallowed silently", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <AppErrorBoundary>
          <Kaboom />
        </AppErrorBoundary>,
      );

      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("renders children untouched while nothing has thrown", () => {
    render(
      <AppErrorBoundary>
        <p>quietly fine</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("quietly fine")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
