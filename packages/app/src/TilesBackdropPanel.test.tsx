import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { TilesBackdropPanel } from "./TilesBackdropPanel";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TilesBackdropPanel", () => {
  it("renders safe 3D basemap, visual asset readiness, and Arnis external generation", () => {
    render(
      <I18nProvider>
        <TilesBackdropPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "真实 3D 底图" })).toBeInTheDocument();
    expect(screen.getByText(/google-photorealistic-3d-tiles/)).toBeInTheDocument();
    expect(
      screen.getByText(/3d-tiles-renderer -> Three.WebGPURenderer/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\/api\/tiles\/google\/tileset\.json/)).toBeInTheDocument();
    expect(screen.getByText(/tilesRenderer\.update/)).toBeInTheDocument();
    expect(screen.getByText(/collision \.csim\.json/)).toBeInTheDocument();
    expect(screen.getByText(/visual-only yes/)).toBeInTheDocument();
    expect(screen.getByText(/GLB assets 2/)).toBeInTheDocument();
    expect(screen.getByText(/unique URLs 2/)).toBeInTheDocument();
    expect(screen.getByText(/fallback 2 placeholders/)).toBeInTheDocument();
    expect(screen.getByText(/LOD low\/medium\/high 0\/2\/0/)).toBeInTheDocument();
    expect(screen.getByText(/budget 127,500 tris/)).toBeInTheDocument();
    expect(screen.getByText(/Arnis external generator/)).toBeInTheDocument();
    expect(screen.getByText(/arnis --bbox/)).toBeInTheDocument();
    expect(screen.getByText(/arnis-generated-context\.glb/)).toBeInTheDocument();
  });
});
