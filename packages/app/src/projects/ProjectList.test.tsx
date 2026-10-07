import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { I18nProvider } from "../i18n";
import { ProjectList } from "./ProjectList";
import {
  createProject,
  readProjects,
  writeProjects,
  type Project,
  type ProjectRecord,
} from "./projectStore";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function scene(id: string) {
  return parseScene({
    schemaVersion: "1.0.0",
    id,
    name: "s",
    world: { width: 40, height: 40 },
  });
}

function record(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    areaSquareMeters: 3200,
    businessCategory: "dining",
    catchmentRadiusMeters: 800,
    contractVersion: 1,
    coordinateSystem: "GCJ-02",
    createdAt: "2026-10-07T12:00:00.000Z",
    floors: 2,
    id: "p1",
    kind: "mall",
    lat: 41.8,
    lng: 123.46,
    name: "中街项目",
    planSource: "drawn",
    updatedAt: "2026-10-07T12:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<ProjectRecord> = {}): Project {
  return createProject(record(overrides), scene(overrides.id ?? "p1"));
}

function renderList(onOpen: (project: Project) => void = () => {}) {
  render(
    <I18nProvider>
      <ProjectList onCreate={() => {}} onOpen={onOpen} />
    </I18nProvider>,
  );
}

describe("ProjectList", () => {
  it("says there is nothing here yet, rather than showing an empty grid", () => {
    renderList();

    expect(screen.getByTestId("project-list-empty")).toBeInTheDocument();
  });

  it("lists a stored project with the numbers the record actually holds", () => {
    writeProjects([project({ name: "中街商场", areaSquareMeters: 3200, floors: 3 })]);

    renderList();

    expect(screen.getByText("中街商场")).toBeInTheDocument();
    expect(screen.getByText(/3200/)).toBeInTheDocument();
    expect(screen.getByText(/3 层/)).toBeInTheDocument();
  });

  it("says a project has no plan rather than showing its floor count as one", () => {
    // The record has a floor count but no geometry. Showing "3 floors" next to
    // a card would read as though a three-floor plan existed.
    writeProjects([project({ planSource: "drawn" })]);

    renderList();

    expect(screen.getByText("未画平面")).toBeInTheDocument();
  });

  it("marks a GLB plan as visual only, because it has no walls", () => {
    // GLB loads as a render asset and produces no geometry: people can walk
    // through a wall and the simulation would not know. Saying so here is the
    // difference between a label and a promise.
    writeProjects([project({ planSource: "glb" })]);

    renderList();

    expect(screen.getByText(/仅外观/)).toBeInTheDocument();
  });

  it("opens the project that was clicked", () => {
    const opened: Project[] = [];

    writeProjects([project({ id: "a", name: "甲" }), project({ id: "b", name: "乙" })]);
    renderList((next) => {
      opened.push(next);
    });

    fireEvent.click(screen.getByTestId("project-open-b"));

    expect(opened).toHaveLength(1);
    expect(opened[0].record.name).toBe("乙");
  });

  it("duplicates a project under a new id without touching the original", () => {
    writeProjects([project({ id: "a", name: "中街" })]);
    renderList();

    fireEvent.click(screen.getByText("复制"));

    expect(screen.getAllByText(/中街/).length).toBe(2);
    expect(screen.getByText("中街（副本）")).toBeInTheDocument();
  });

  it("removes a project from the list and from storage", () => {
    writeProjects([project({ id: "a", name: "甲" }), project({ id: "b", name: "乙" })]);
    renderList();

    fireEvent.click(screen.getAllByText("删除")[0]!);

    expect(screen.queryByText("甲")).toBeNull();
    expect(screen.getByText("乙")).toBeInTheDocument();
    expect(screen.queryByTestId("project-list-empty")).toBeNull();
  });

  it("falls back to the empty state once the last project is gone", () => {
    writeProjects([project({ id: "a", name: "甲" })]);
    renderList();

    fireEvent.click(screen.getByText("删除"));

    expect(screen.getByTestId("project-list-empty")).toBeInTheDocument();
  });

  it("says the save failed instead of showing work that was not kept", () => {
    writeProjects([project({ id: "a", name: "甲" }), project({ id: "b", name: "乙" })]);

    // Captured before the spy is installed: `Storage.prototype.setItem` inside the
    // mock would call the mock. Scoped to this app's key, because `i18n.ts`
    // writes the language preference to localStorage too and breaking that
    // would make this a test of the mock rather than of the list.
    const original = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "crowdsim.projects.v1") {
        throw new DOMException("quota", "QuotaExceededError");
      }

      return original.call(this, key, value);
    });

    renderList();
    fireEvent.click(screen.getAllByText("删除")[0]!);

    // The card is gone from the screen but nothing was stored, so the user has
    // to hear about it rather than close the tab believing it worked.
    expect(screen.getByTestId("project-list-error")).toBeInTheDocument();

    setItem.mockRestore();
  });

  it("does not show a project whose record has no name", () => {
    localStorage.setItem(
      "crowdsim.projects.v1",
      JSON.stringify([{ record: { id: "x" }, scene: scene("x") }]),
    );

    renderList();

    // Dropped at read time: a nameless card is not a project anyone can find.
    expect(screen.getByTestId("project-list-empty")).toBeInTheDocument();
  });

  it("shows the most recently touched project first", () => {
    writeProjects([
      project({ id: "old", name: "旧", updatedAt: "2026-10-01T00:00:00.000Z" }),
      project({ id: "new", name: "新", updatedAt: "2026-10-07T00:00:00.000Z" }),
    ]);

    renderList();

    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(names).toEqual(["新", "旧"]);
  });
});

describe("duplicating twice in the same millisecond", () => {
  it("keeps both copies rather than letting the second overwrite the first", () => {
    // Two clicks within one millisecond produce the same `Date.now()` id, and
    // `upsertProject` treats a matching id as the same project — so the
    // second duplicate silently replaced the first.
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    writeProjects([project({ id: "a", name: "甲" })]);
    renderList();

    fireEvent.click(screen.getAllByText("复制")[0]!);
    fireEvent.click(screen.getAllByText("复制")[0]!);

    const stored = readProjects();

    expect(stored).toHaveLength(3);
    expect(new Set(stored.map((p) => p.record.id)).size).toBe(3);

    now.mockRestore();
  });
});
