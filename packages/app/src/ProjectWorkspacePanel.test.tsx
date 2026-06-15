import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { ProjectWorkspacePanel } from "./ProjectWorkspacePanel";

describe("ProjectWorkspacePanel", () => {
  it("renders project workspace productization state", () => {
    render(
      <I18nProvider>
        <ProjectWorkspacePanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "项目工作台" })).toBeInTheDocument();
    expect(screen.getByText("planner")).toBeInTheDocument();
    expect(screen.getByText(/active \| csess_demo/)).toBeInTheDocument();
    expect(screen.getByText("Atrium evacuation review")).toBeInTheDocument();
    expect(screen.getByText("/share/demo-read-only")).toBeInTheDocument();
    expect(screen.getByText(/\/api\/auth\/login/)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/auth\/session/)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/projects/)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/ai\/:provider/)).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare Workers \+ D1\/R2/)).toBeInTheDocument();
    expect(screen.getByText(/quota ok/)).toBeInTheDocument();
    expect(screen.getByText(/session active/)).toBeInTheDocument();
  });
});
