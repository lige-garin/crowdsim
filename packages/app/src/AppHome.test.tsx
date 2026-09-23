import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHome } from "./AppHome";

afterEach(cleanup);

function renderHome() {
  return render(
    <AppHome
      language="en"
      onEnterLab={vi.fn()}
      onOpenNetwork={vi.fn()}
      onSetLanguage={vi.fn()}
      runState="running"
      webGpuStatus="ready"
    />,
  );
}

describe("AppHome status pulses", () => {
  it("never claims a live Cloudflare D1/R2 connection the backend doesn't have", () => {
    renderHome();
    // The backend's default (and only production-reachable) store is
    // in-memory; D1/R2 are structural interfaces with no wrangler.toml or
    // worker entrypoint anywhere that ever constructs a real D1/R2-backed
    // store. See CollaborationStatusPanel's own "contracts" wording.
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.queryByText("D1/R2")).not.toBeInTheDocument();
  });

  it("never claims image tracing has a model behind it", () => {
    renderHome();
    expect(screen.getByText("fixture")).toBeInTheDocument();
  });
});
