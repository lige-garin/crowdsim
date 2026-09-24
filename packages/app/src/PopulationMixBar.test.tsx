import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PopulationMixBar } from "./PopulationMixBar";
import { populationLibraryEntry } from "./populationSampling";

afterEach(cleanup);

const t = (key: string) => key;

describe("PopulationMixBar", () => {
  it("renders one segment per profile in the mix, sized by its share", () => {
    const mix = populationLibraryEntry("imo-ship-passengers")?.mix ?? [];
    render(<PopulationMixBar mix={mix} t={t} />);

    const total = mix.reduce((sum, entry) => sum + entry.share, 0);

    for (const entry of mix) {
      const segment = screen.getByTestId(`population-mix-segment-${entry.profileId}`);
      const expectedPercent = (entry.share / total) * 100;
      expect(segment).toHaveStyle({ width: `${expectedPercent}%` });
    }
  });

  it("names each segment's profile and share in a title tooltip", () => {
    const mix = populationLibraryEntry("imo-ship-passengers")?.mix ?? [];
    render(<PopulationMixBar mix={mix} t={t} />);

    const segment = screen.getByTestId("population-mix-segment-female-under-30");
    expect(segment.getAttribute("title")).toBe("Females younger than 30 years: 7%");
  });

  it("lists every segment's label and percentage in a legend", () => {
    const mix = populationLibraryEntry("imo-ship-passengers")?.mix ?? [];
    render(<PopulationMixBar mix={mix} t={t} />);

    expect(screen.getByText(/Females younger than 30 years: 7%/)).toBeInTheDocument();
    expect(
      screen.getByText(/Males older than 50, mobility impaired \(1\): 10%/),
    ).toBeInTheDocument();
  });

  it("renders nothing for an empty mix", () => {
    const { container } = render(<PopulationMixBar mix={[]} t={t} />);

    expect(container).toBeEmptyDOMElement();
  });
});
