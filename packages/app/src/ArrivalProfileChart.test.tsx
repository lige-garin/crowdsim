import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArrivalProfileChart } from "./ArrivalProfileChart";

afterEach(cleanup);

// The identity stub every other test in this editor's param-grid family uses
// (see SceneEditorParamPanel.test.tsx's own baseProps()) -- this component
// takes a plain `t` prop rather than calling useI18n() for exactly this
// reason, so it stays decoupled from real translation strings in tests.
const t = (key: string) => key;

function renderChart(rates: number[], onChange = vi.fn()) {
  render(
    <ArrivalProfileChart
      intervalMinutes={15}
      onChange={onChange}
      rates={rates}
      t={t}
    />,
  );
  return onChange;
}

describe("ArrivalProfileChart", () => {
  it("draws one bar per rate, each reporting its own value as an accessible slider", () => {
    renderChart([60, 120, 90]);

    for (const [index, rate] of [60, 120, 90].entries()) {
      const bar = screen.getByTestId(`arrival-profile-bar-${index}`);
      expect(bar).toHaveAttribute("role", "slider");
      expect(bar).toHaveAttribute("aria-valuenow", String(rate));
    }
  });

  it("names each slot with its own number and start minute", () => {
    renderChart([60, 120]);

    expect(screen.getByTestId("arrival-profile-bar-0")).toHaveAttribute(
      "aria-label",
      "arrivalProfileSlotLabel 1, arrivalProfileFromMinute 0",
    );
    expect(screen.getByTestId("arrival-profile-bar-1")).toHaveAttribute(
      "aria-label",
      "arrivalProfileSlotLabel 2, arrivalProfileFromMinute 15",
    );
  });

  it("raises the rate on ArrowUp and calls onChange with only that slot changed", () => {
    const onChange = renderChart([60, 120, 90]);

    fireEvent.keyDown(screen.getByTestId("arrival-profile-bar-1"), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith([60, 125, 90]);
  });

  it("lowers the rate on ArrowDown, never below zero", () => {
    const onChange = renderChart([60, 2, 90]);

    fireEvent.keyDown(screen.getByTestId("arrival-profile-bar-1"), {
      key: "ArrowDown",
    });

    expect(onChange).toHaveBeenCalledWith([60, 0, 90]);
  });
});
