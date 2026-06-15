import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollaborationStatusPanel } from "./CollaborationStatusPanel";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("CollaborationStatusPanel", () => {
  it("renders project collaboration readiness", () => {
    render(
      <I18nProvider>
        <CollaborationStatusPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "协作后端" })).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare D1\/R2/)).toBeInTheDocument();
    expect(screen.getByText(/projects 1/)).toBeInTheDocument();
    expect(screen.getByText(/events 1/)).toBeInTheDocument();
  });
});
