import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContactNetworkView } from "./ContactNetworkView";
import { I18nProvider } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ContactNetworkView", () => {
  it("renders a Chinese contact graph with doctor-patient links", () => {
    render(
      <I18nProvider>
        <ContactNetworkView />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "接触网络" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "接触网络图" })).toBeInTheDocument();
    expect(screen.getByLabelText("接触连线图例")).toBeInTheDocument();
    expect(screen.getByText("陈医生")).toBeInTheDocument();
    expect(screen.getByText("病人 P-17")).toBeInTheDocument();
    expect(screen.getAllByText("诊疗接触").length).toBeGreaterThan(0);
  });

  it("renders a care contact network in English", () => {
    localStorage.setItem("crowdsim.language", "en");

    render(
      <I18nProvider>
        <ContactNetworkView />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Contact Network" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Contact network graph" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dr. Chen")).toBeInTheDocument();
    expect(screen.getByText("Patient P-17")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact link legend")).toBeInTheDocument();
    expect(screen.getAllByText("doctor visit").length).toBeGreaterThan(0);
  });
});
