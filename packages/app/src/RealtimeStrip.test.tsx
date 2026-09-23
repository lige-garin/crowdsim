import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RealtimeStrip } from "./RealtimeStrip";

afterEach(cleanup);

describe("RealtimeStrip", () => {
  it("renders a canvas and shows a waiting label with no samples", () => {
    render(<RealtimeStrip language="en" samples={[]} />);

    expect(screen.getByTestId("realtime-strip").querySelector("canvas")).not.toBeNull();
    expect(screen.getByText("Waiting for the first sample…")).toBeInTheDocument();
  });

  it("shows the latest sample's agent count once there is one", () => {
    render(
      <RealtimeStrip
        language="zh"
        samples={[
          { agentCount: 5, elapsedSeconds: 1, exitedCount: 0 },
          { agentCount: 42, elapsedSeconds: 2, exitedCount: 0 },
        ]}
      />,
    );

    expect(screen.getByTestId("realtime-strip")).toHaveTextContent("42");
  });

  it("does not throw when jsdom's canvas has no 2D context (no canvas package installed)", () => {
    // getContext returns null in this test environment; the draw effect must
    // no-op rather than crash -- this is the only place that gets exercised.
    expect(() =>
      render(
        <RealtimeStrip
          language="en"
          samples={[
            { agentCount: 1, elapsedSeconds: 1, exitedCount: 0 },
            { agentCount: 2, elapsedSeconds: 2, exitedCount: 0 },
          ]}
        />,
      ),
    ).not.toThrow();
  });
});
