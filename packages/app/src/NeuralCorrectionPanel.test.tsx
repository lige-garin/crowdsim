import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n";
import { NeuralCorrectionPanel } from "./NeuralCorrectionPanel";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("NeuralCorrectionPanel", () => {
  it("renders trajectory calibration and auditable MLP correction", () => {
    render(
      <I18nProvider>
        <NeuralCorrectionPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "神经修正层" })).toBeInTheDocument();
    expect(screen.getByText(/MLP residual applied/)).toBeInTheDocument();
    expect(screen.getByText(/dataset 3 tracks/)).toBeInTheDocument();
    expect(screen.getByText(/speed x/)).toBeInTheDocument();
    expect(screen.getByText(/error/)).toBeInTheDocument();
    expect(screen.getByText(/model/)).toBeInTheDocument();
    expect(screen.getByText(/trained 6 samples/)).toBeInTheDocument();
    expect(screen.getByText(/source trained-dataset/)).toBeInTheDocument();
    expect(screen.getByText(/WGSL infer_neural_residual/)).toBeInTheDocument();
    expect(screen.getByText(/默认关闭，需 M5 全绿/)).toBeInTheDocument();
  });
});
