import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RealObservationsPanel } from "./RealObservationsPanel";
import type { MinuteFlow, RunAnalyticsSummary } from "../analytics/runAnalytics";

afterEach(cleanup);

const simulatedFlows: MinuteFlow[] = [
  { backward: 2, forward: 10, id: "gate", minuteStartSeconds: 0, name: "Main gate" },
];
const places: RunAnalyticsSummary["places"] = [
  {
    kind: "service",
    p50Seconds: 10,
    p90Seconds: 20,
    peakConcurrent: 1,
    placeId: "shop-1",
    visits: 5,
  },
];

function renderPanel(minuteFlows: () => MinuteFlow[] = () => simulatedFlows) {
  return render(
    <RealObservationsPanel language="zh" minuteFlows={minuteFlows} places={places} />,
  );
}

describe("RealObservationsPanel", () => {
  it("shows empty state before anything is imported", () => {
    renderPanel();
    expect(screen.getByText("尚未导入计数线数据。")).toBeInTheDocument();
    expect(screen.getByText("尚未导入小票数据。")).toBeInTheDocument();
  });

  it("imports a line-count CSV and shows the comparison summary", async () => {
    renderPanel();
    const input = screen.getByTestId("import-line-counts-input") as HTMLInputElement;
    const csv = "line_id,minute_start_s,forward,backward\ngate,0,11,3";

    fireEvent.change(input, { target: { files: [new File([csv], "counts.csv")] } });

    expect(await screen.findByTestId("line-count-summary")).toBeInTheDocument();
    expect(screen.getByTestId("line-count-summary")).toHaveTextContent("1"); // matched minutes
  });

  it("shows a real, non-silent error for an invalid CSV instead of pretending nothing happened", async () => {
    renderPanel();
    const input = screen.getByTestId("import-line-counts-input") as HTMLInputElement;
    const badCsv = "minute_start_s,forward,backward\n0,1,1"; // no line id/name column

    fireEvent.change(input, { target: { files: [new File([badCsv], "bad.csv")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /missing 'line_id' or 'line_name'/,
    );
  });

  it("imports a receipts CSV and compares transaction totals against service visits", async () => {
    renderPanel();
    const input = screen.getByTestId("import-receipts-input") as HTMLInputElement;
    const csv = "place_id,timestamp_s\nshop-1,10\nshop-1,20\nshop-1,30";

    fireEvent.change(input, { target: { files: [new File([csv], "receipts.csv")] } });

    const summary = await screen.findByTestId("receipt-comparison");
    expect(summary).toHaveTextContent("shop-1");
    expect(summary).toHaveTextContent("3"); // 3 observed transactions
    expect(summary).toHaveTextContent("5"); // 5 simulated service visits
  });

  it("recomputes the comparison against whatever minuteFlows returns each render, not a fixed snapshot", async () => {
    let flows: MinuteFlow[] = simulatedFlows;
    const { rerender } = renderPanel(() => flows);
    const input = screen.getByTestId("import-line-counts-input") as HTMLInputElement;
    const csv = "line_id,minute_start_s,forward,backward\ngate,0,10,2";
    fireEvent.change(input, { target: { files: [new File([csv], "counts.csv")] } });
    await screen.findByTestId("line-count-summary");
    expect(screen.getByTestId("line-count-summary")).toHaveTextContent("0.00"); // exact match

    flows = [
      {
        backward: 2,
        forward: 20,
        id: "gate",
        minuteStartSeconds: 0,
        name: "Main gate",
      },
    ];
    rerender(
      <RealObservationsPanel language="zh" minuteFlows={() => flows} places={places} />,
    );
    expect(screen.getByTestId("line-count-summary")).toHaveTextContent("5.00"); // |10-20|/2
  });
});

describe("what this panel is not", () => {
  it("never claims a data-assimilation loop back into the running simulation", () => {
    renderPanel();
    expect(screen.getByText(/不是数据同化/)).toBeInTheDocument();
  });
});
