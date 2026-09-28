import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContactNetworkView } from "./ContactNetworkView";
import { I18nProvider } from "../i18n";
import type { CrowdContactNetwork } from "../engine/crowdContactNetwork";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const network: CrowdContactNetwork = {
  nodes: [
    { id: "agent-1", label: "客 #1", state: "browse", xPercent: 30, yPercent: 40 },
    { id: "agent-2", label: "客 #2", state: "queue", xPercent: 35, yPercent: 42 },
  ],
  links: [
    {
      id: "link-1-2",
      source: "agent-1",
      target: "agent-2",
      kind: "sameShop",
      strength: 0.8,
    },
  ],
};

describe("ContactNetworkView", () => {
  it("renders the live crowd contact graph in Chinese", () => {
    render(
      <I18nProvider>
        <ContactNetworkView network={network} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "客流接触网络" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "接触网络图" })).toBeInTheDocument();
    expect(screen.getByText(/客 #1/)).toBeInTheDocument();
    expect(screen.getAllByText("同店相遇").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no contacts", () => {
    render(
      <I18nProvider>
        <ContactNetworkView network={{ nodes: [], links: [] }} />
      </I18nProvider>,
    );

    expect(screen.getByText(/暂无近距离接触/)).toBeInTheDocument();
  });

  it("renders the graph in English", () => {
    localStorage.setItem("crowdsim.language", "en");

    render(
      <I18nProvider>
        <ContactNetworkView network={network} />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Crowd Contact Network" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("same shop").length).toBeGreaterThan(0);
  });
});
