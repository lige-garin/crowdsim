import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiWorkflowPanel } from "./AiWorkflowPanel";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AiWorkflowPanel", () => {
  it("renders event-script and experiment-suggestion status", () => {
    render(
      <I18nProvider>
        <AiWorkflowPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "AI 闭环" })).toBeInTheDocument();
    expect(screen.getByText(/close-entrance/)).toBeInTheDocument();
    expect(screen.getByText(/experiments/)).toBeInTheDocument();
    expect(screen.getByText(/schema accepted 2/)).toBeInTheDocument();
    expect(screen.getByText(/proxy \/api\/ai\/anthropic/)).toBeInTheDocument();
  });
});
