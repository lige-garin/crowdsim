import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { industryTemplates } from "../scenes/industryTemplates";
import { TemplateGallery } from "./TemplateGallery";

afterEach(cleanup);

describe("TemplateGallery", () => {
  it("renders one card per industry template", () => {
    render(<TemplateGallery language="en" onSelect={vi.fn()} />);

    for (const template of industryTemplates) {
      expect(screen.getByTestId(`template-card-${template.id}`)).toBeInTheDocument();
    }
  });

  it("calls onSelect with the template's real scene when a card is clicked", () => {
    const onSelect = vi.fn();
    render(<TemplateGallery language="en" onSelect={onSelect} />);

    const firstTemplate = industryTemplates[0];
    fireEvent.click(screen.getByTestId(`template-card-${firstTemplate.id}`));

    expect(onSelect).toHaveBeenCalledWith(firstTemplate.scene);
  });

  it("shows the recommended arrival rate, speed, and max agents for each template", () => {
    render(<TemplateGallery language="en" onSelect={vi.fn()} />);

    const firstTemplate = industryTemplates[0];
    const card = screen.getByTestId(`template-card-${firstTemplate.id}`);

    expect(card).toHaveTextContent(
      `${firstTemplate.recommended.arrivalRatePerMinute}/min`,
    );
    expect(card).toHaveTextContent(
      `${firstTemplate.recommended.speedMetersPerSecond}m/s`,
    );
    expect(card).toHaveTextContent(`max ${firstTemplate.recommended.maxAgents}`);
  });
});
