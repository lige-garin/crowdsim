import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHome } from "./AppHome";
import { I18nProvider } from "./i18n";
import { industryTemplates } from "./scenes/industryTemplates";

afterEach(cleanup);

function renderHome(
  uiMode: "basic" | "expert",
  extraProps: Record<string, unknown> = {},
) {
  const onEnterLab = vi.fn();
  const onOpenNetwork = vi.fn();
  const onSelectTemplate = vi.fn();
  const onToggleUiMode = vi.fn();

  render(
    // Basic mode renders the project list, which reads language through
    // `useI18n`. The provider is the app's own wiring, not a test convenience:
    // without it this screen would throw in the app too if the provider were
    // ever one layer higher.
    <I18nProvider>
      <AppHome
        creatingProject={false}
        language="en"
        onCancelProjectCreate={vi.fn()}
        onCreateProject={vi.fn()}
        onEnterLab={onEnterLab}
        onOpenNetwork={onOpenNetwork}
        onOpenProject={vi.fn()}
        onProjectSubmit={vi.fn()}
        onProjectPlace={vi.fn()}
        pendingLocation={null}
        onSelectTemplate={onSelectTemplate}
        onSetLanguage={vi.fn()}
        onToggleUiMode={onToggleUiMode}
        runState="running"
        uiMode={uiMode}
        webGpuStatus="ready"
        {...extraProps}
      />
    </I18nProvider>,
  );

  return { onEnterLab, onOpenNetwork, onSelectTemplate, onToggleUiMode };
}

describe("AppHome basic/expert mode", () => {
  it("shows the template gallery and no console/network buttons in basic mode", () => {
    renderHome("basic");

    expect(
      screen.getByTestId(`template-card-${industryTemplates[0].id}`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open console" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View network" })).toBeNull();
  });

  it("shows the console/network buttons and no template gallery in expert mode", () => {
    renderHome("expert");

    expect(screen.queryByTestId(`template-card-${industryTemplates[0].id}`)).toBeNull();
    expect(screen.getByRole("button", { name: "Open console" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View network" })).toBeInTheDocument();
  });

  it("picking a template card in basic mode hands the real scene to onSelectTemplate", () => {
    const { onSelectTemplate } = renderHome("basic");
    const firstTemplate = industryTemplates[0];

    fireEvent.click(screen.getByTestId(`template-card-${firstTemplate.id}`));

    expect(onSelectTemplate).toHaveBeenCalledWith(firstTemplate.scene);
  });

  it("the mode toggle button calls onToggleUiMode and is labelled for the other mode", () => {
    const { onToggleUiMode } = renderHome("basic");

    const toggle = screen.getByRole("button", { name: "Switch to expert mode" });
    fireEvent.click(toggle);

    expect(onToggleUiMode).toHaveBeenCalledOnce();
  });
});
