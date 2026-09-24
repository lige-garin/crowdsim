import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutageWindowTimeline } from "./OutageWindowTimeline";

afterEach(cleanup);

// Same identity stub every other test in this editor's param-grid family
// uses (see ArrivalProfileChart.test.tsx) -- this component takes a plain
// `t` prop rather than calling useI18n() for the same reason.
const t = (key: string) => key;

function renderTimeline(
  windows: { startsAtSeconds: number; endsAtSeconds: number }[],
  onChange = vi.fn(),
) {
  render(<OutageWindowTimeline windows={windows} onChange={onChange} t={t} />);
  return onChange;
}

describe("OutageWindowTimeline", () => {
  it("draws a start and end handle per window, each an accessible slider", () => {
    renderTimeline([
      { startsAtSeconds: 50, endsAtSeconds: 150 },
      { startsAtSeconds: 600, endsAtSeconds: 900 },
    ]);

    expect(screen.getByTestId("outage-window-start-0")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(screen.getByTestId("outage-window-end-0")).toHaveAttribute(
      "aria-valuenow",
      "150",
    );
    expect(screen.getByTestId("outage-window-start-1")).toHaveAttribute(
      "aria-valuenow",
      "600",
    );
    expect(screen.getByTestId("outage-window-end-1")).toHaveAttribute(
      "aria-valuenow",
      "900",
    );
  });

  it("moves the start handle right on ArrowRight, calling onChange with only that edge changed", () => {
    const onChange = renderTimeline([{ startsAtSeconds: 50, endsAtSeconds: 150 }]);

    fireEvent.keyDown(screen.getByTestId("outage-window-start-0"), {
      key: "ArrowRight",
    });

    expect(onChange).toHaveBeenCalledWith([
      { startsAtSeconds: 80, endsAtSeconds: 150 },
    ]);
  });

  it("moves the end handle left on ArrowLeft", () => {
    const onChange = renderTimeline([{ startsAtSeconds: 50, endsAtSeconds: 150 }]);

    fireEvent.keyDown(screen.getByTestId("outage-window-end-0"), { key: "ArrowLeft" });

    expect(onChange).toHaveBeenCalledWith([
      { startsAtSeconds: 50, endsAtSeconds: 120 },
    ]);
  });

  it("keeps a minimum gap: the start handle cannot cross past the end handle", () => {
    const onChange = renderTimeline([{ startsAtSeconds: 50, endsAtSeconds: 60 }]);

    fireEvent.keyDown(screen.getByTestId("outage-window-start-0"), {
      key: "ArrowRight",
    });

    expect(onChange).toHaveBeenCalledWith([{ startsAtSeconds: 30, endsAtSeconds: 60 }]);
  });

  it("keeps the start handle at zero or above", () => {
    const onChange = renderTimeline([{ startsAtSeconds: 10, endsAtSeconds: 150 }]);

    fireEvent.keyDown(screen.getByTestId("outage-window-start-0"), {
      key: "ArrowLeft",
    });

    expect(onChange).toHaveBeenCalledWith([{ startsAtSeconds: 0, endsAtSeconds: 150 }]);
  });
});
