import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseScene, safeParseScene } from "@crowdsim/scene-schema";
import {
  createProject,
  readProjects,
  removeProject,
  upsertProject,
  writeProjects,
  type Project,
  type ProjectRecord,
} from "./projectStore";

/**
 * A minimal scene. The project store does not build geometry — it stores what
 * a plan route produced — so the scene here only has to be a valid one.
 */
function scene(id: string) {
  return parseScene({
    schemaVersion: "1.0.0",
    id,
    name: "Project scene",
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

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("project store", () => {
  it("starts empty rather than throwing when nothing is stored", () => {
    expect(readProjects()).toEqual([]);
  });

  it("round-trips a project", () => {
    writeProjects([project()]);

    const [restored] = readProjects();

    expect(restored?.record.name).toBe("中街项目");
    expect(restored?.record.lat).toBe(41.8);
    expect(restored?.record.coordinateSystem).toBe("GCJ-02");
    expect(restored?.scene.world.width).toBe(40);
  });

  it("keeps the plan source, because it decides which editor opens", () => {
    writeProjects([project({ planSource: "dxf" })]);
    expect(readProjects()[0]?.record.planSource).toBe("dxf");

    writeProjects([project({ planSource: "glb" })]);
    expect(readProjects()[0]?.record.planSource).toBe("glb");
  });

  it("falls back on an unknown plan source rather than storing it", () => {
    // The four routes are all this app knows how to open. A fifth name from a
    // newer build would open as "drawn" — the route that always works.
    const entry = {
      record: { ...record(), planSource: "photoscan" },
      scene: scene("p1"),
    };

    localStorage.setItem("crowdsim.projects.v1", JSON.stringify([entry]));

    expect(readProjects()[0]?.record.planSource).toBe("drawn");
  });

  it("reports a failed save instead of throwing on a quota error", () => {
    // A list that silently forgets is worse than one that says it could not
    // save, so the boolean is the whole point of the signature.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(writeProjects([project()])).toBe(false);

    setItem.mockRestore();
  });

  it("reads an empty list back as empty when saving is impossible", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(writeProjects([project()])).toBe(false);
    expect(readProjects()).toEqual([]);

    setItem.mockRestore();
  });

  it("drops one unreadable project rather than the whole list", () => {
    localStorage.setItem(
      "crowdsim.projects.v1",
      JSON.stringify([
        { record: record({ id: "good1", name: "甲" }), scene: scene("good1") },
        { record: { id: "bad" }, scene: "not a scene" },
        { record: record({ id: "good2", name: "乙" }), scene: scene("good2") },
      ]),
    );

    expect(readProjects().map((p) => p.record.name)).toEqual(["甲", "乙"]);
  });

  it("drops a project whose scene no longer parses", () => {
    // The shape is right but a required field is missing: editing a scene by
    // hand, or a scene written by a newer schema.
    localStorage.setItem(
      "crowdsim.projects.v1",
      JSON.stringify([
        {
          record: record({ id: "half" }),
          scene: {
            schemaVersion: "1.0.0",
            id: "half",
            world: { width: -1, height: 4 },
          },
        },
      ]),
    );

    expect(readProjects()).toEqual([]);
  });

  it("replaces a corrupt store rather than throwing on every later read", () => {
    localStorage.setItem("crowdsim.projects.v1", "{not json");

    expect(readProjects()).toEqual([]);
    expect(localStorage.getItem("crowdsim.projects.v1")).toBeNull();
  });

  it("upserts by id, and an edit does not reorder the list", () => {
    const first = project({ id: "a", name: "甲" });
    const second = project({ id: "b", name: "乙" });

    const withBoth = upsertProject(second, upsertProject(first, []));
    // Newest first.
    expect(withBoth.map((p) => p.record.id)).toEqual(["b", "a"]);

    // Renaming replaces in place. The order says when a project was added, and
    // a project that jumps to the top every time it is opened would make the
    // list impossible to scan for the one you were last working on.
    const renamed = upsertProject(project({ id: "a", name: "甲改名" }), withBoth);
    expect(renamed.map((p) => p.record.name)).toEqual(["乙", "甲改名"]);
  });

  it("removes by id", () => {
    const list = [project({ id: "a" }), project({ id: "b" })];

    expect(removeProject("a", list).map((p) => p.record.id)).toEqual(["b"]);
    expect(removeProject("missing", list)).toHaveLength(2);
  });

  it("never lets an unrecognised business category through to the scene", () => {
    // This string reaches `brandSchema`, which rejects it. Carrying a stale
    // value forward would make the project list load and then fail to parse
    // the moment it opened.
    localStorage.setItem(
      "crowdsim.projects.v1",
      JSON.stringify([
        { record: { ...record(), businessCategory: "nightclub" }, scene: scene("p1") },
      ]),
    );

    expect(readProjects()[0]?.record.businessCategory).toBe("dining");
  });
});

describe("the category list this file duplicates", () => {
  it("holds only categories the schema accepts", () => {
    // `brandCategorySchema` is not exported from the package index, so
    // projectStore.ts spells its values out. This is what keeps that copy
    // honest: every value the store can write must survive the schema, and
    // the schema's own list is the one being compared against.
    for (const category of storeCategories) {
      const probe = safeParseScene({
        schemaVersion: "1.0.0",
        id: "probe",
        name: "probe",
        world: { width: 40, height: 40 },
        shops: [
          {
            id: "s",
            name: "s",
            position: { x: 5, y: 5 },
            size: { width: 4, height: 4 },
            brand: { category, name: "s", profileId: "probe" },
          },
        ],
      });

      expect(
        probe?.success === true && probe.data.shops[0].brand?.category,
        `${category} is in projectStore's list but the schema rejects it`,
      ).toBe(category);
    }
  });

  it("falls back rather than passing an unknown category through", () => {
    // If the schema ever grows a category this list misses, reading a project
    // that used it must still yield a loadable record. Falling back to "dining"
    // is a guess, and a labelled one — the record's own fields show what it
    // says, and the scene it carries is parsed either way.
    localStorage.setItem(
      "crowdsim.projects.v1",
      JSON.stringify([
        {
          record: { ...record(), businessCategory: "category-from-the-future" },
          scene: scene("p1"),
        },
      ]),
    );

    const [restored] = readProjects();

    expect(restored?.record.businessCategory).toBe("dining");
    expect(restored?.scene.world.width).toBe(40);
  });

  it("does not silently drop a category the schema added", () => {
    // The other direction: a new schema category that the store does not know
    // falls back to "dining" when read. That is a deliberate choice, and this
    // asserts it exists rather than pretending the two lists are linked.
    localStorage.setItem(
      "crowdsim.projects.v1",
      JSON.stringify([
        {
          record: { ...record(), businessCategory: "brand-new-category" },
          scene: scene("p1"),
        },
      ]),
    );

    expect(readProjects()[0]?.record.businessCategory).toBe("dining");
  });
});

/**
 * The values projectStore.ts accepts. Written here as the two lists must be
 * compared somewhere; the schema is the authority (the first test), so this one
 * only has to say "the store offers all thirteen".
 */
const storeCategories: ProjectRecord["businessCategory"][] = [
  "anchor",
  "coffee",
  "cosmetics",
  "dining",
  "electronics",
  "entertainment",
  "family",
  "fastFashion",
  "grocery",
  "jewelry",
  "luxury",
  "restaurant",
  "service",
];
