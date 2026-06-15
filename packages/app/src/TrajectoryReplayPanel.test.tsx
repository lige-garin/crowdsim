import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { TrajectoryReplayPanel } from "./TrajectoryReplayPanel";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TrajectoryReplayPanel", () => {
  it("renders trajectory recording readiness", () => {
    render(
      <I18nProvider>
        <TrajectoryReplayPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "录制 / 回放" })).toBeInTheDocument();
    expect(screen.getByText(/frames 3/)).toBeInTheDocument();
    expect(screen.getByText(/agents 2/)).toBeInTheDocument();
    expect(screen.getByText(/packed/)).toBeInTheDocument();
  });
});
