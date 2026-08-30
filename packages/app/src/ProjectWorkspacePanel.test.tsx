import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createCrowdSimBackend } from "@crowdsim/backend";
import { I18nProvider } from "./i18n";
import { ProjectWorkspacePanel } from "./ProjectWorkspacePanel";
import { createBackendClient } from "./backendClient";
import { bioCityDemoScene } from "./bioCityDemoScene";

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

  it("lists live projects from a real backend client", async () => {
    const backend = createCrowdSimBackend({ allowUnauthenticatedLogin: true });
    const client = createBackendClient({
      fetch: backend.fetch,
      baseUrl: "http://backend.local",
    });
    await client.login({ accountId: "demo-owner" });
    await client.createProject({
      id: "px",
      name: "Plaza",
      scene: bioCityDemoScene,
    });

    const { container } = render(
      <I18nProvider>
        <ProjectWorkspacePanel client={client} />
      </I18nProvider>,
    );

    expect(await within(container).findByText("Plaza")).toBeInTheDocument();
  });

  it("labels the no-client fallback as sample data", () => {
    const { container } = render(
      <I18nProvider>
        <ProjectWorkspacePanel />
      </I18nProvider>,
    );

    expect(within(container).getByText(/sample data|样例数据/i)).toBeInTheDocument();
  });
});
