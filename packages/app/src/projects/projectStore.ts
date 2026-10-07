import { parseScene, safeParseScene, type CrowdSimScene } from "@crowdsim/scene-schema";

/**
 * What a project **is**, as distinct from what a scene is.
 *
 * The scene is the simulation's input: geometry, shops, arrivals, a seed.
 * It answers "what does this place look like to the engine". A project is the
 * thing a person came here to make, and it answers three more questions that
 * the scene deliberately does not carry:
 *
 * - **where** it is (lat/lng and a catchment radius), which the engine has no
 *   use for but which is the first thing anyone wants to know afterwards;
 * - **what kind of place** it is, which decides which of the four ways its
 *   floor plan can arrive;
 * - **how far along** it is, so a list can say "draft" against "ready to run"
 *   without running anything.
 *
 * So the scene lives *inside* the project, not beside it. That is what makes
 * the list work offline and with no account: one JSON per project in
 * localStorage, exactly as `SceneEditor`'s autosave already stores one scene.
 *
 * What this is **not**: a claim that the project data is a source of truth. The
 * arrival rates the engine runs on are still inference, and a project that says
 * `catchmentRadiusMeters: 800` is saying where it is, not how many people come.
 */

const STORAGE_KEY = "crowdsim.projects.v1";

/**
 * Plan provenance. **The only thing this enum decides is which editor tool is
 * waiting when the project opens** — it never claims a floor plan was produced
 * from the source named. A DXF import gets walls but no door openings, and a
 * drawn plan has no source file at all; both say so where they are shown.
 */
export type PlanSource = "drawn" | "dxf" | "skeleton" | "glb";

/**
 * What kind of place this is. Not a taxonomy for its own sake: each value
 * picks which questions the form asks, because a mall's floor count is the
 * plan and a single shop's is one number.
 */
export type ProjectKind = "mall" | "shop";

/**
 * The schema's own brand categories, read off the type rather than written
 * out: a hand-copied list is a list that goes stale when the schema gains a
 * category, and then the form offers a value the scene will not parse.
 */
export type BrandCategory = NonNullable<
  CrowdSimScene["shops"][number]["brand"]
>["category"];

export type ProjectRecord = {
  contractVersion: 1;
  createdAt: string;
  /** WGS-84 would be wrong here: the map we place on is GCJ-02 throughout. */
  coordinateSystem: "GCJ-02";
  id: string;
  kind: ProjectKind;
  /** Square metres of the footprint the plan covers. */
  areaSquareMeters: number;
  /** Storefront categories drive arrival shape; see `brandSchema.category`. */
  businessCategory: BrandCategory;
  catchmentRadiusMeters: number;
  floors: number;
  lat: number;
  lng: number;
  name: string;
  planSource: PlanSource;
  updatedAt: string;
};

export type Project = {
  record: ProjectRecord;
  scene: CrowdSimScene;
};

/**
 * localStorage is read at module scope by nothing: every function here takes
 * the value it needs, so a test can pass a fake and a quota error can be
 * caught where it happens rather than at import time. `SceneEditor` learned
 * that the hard way (see its autosave comment).
 */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Private mode in some browsers throws on access, not just on write.
    return null;
  }
}

export function readProjects(): Project[] {
  const store = storage();
  const raw = store?.getItem(STORAGE_KEY);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    // One unreadable project must not cost the user the other eleven, so a
    // project that fails validation is dropped and the rest are returned.
    return parsed.flatMap((entry) => {
      const project = toProject(entry);

      return project ? [project] : [];
    });
  } catch {
    // Corrupt JSON. The key is the only thing this module owns, so replacing
    // it is not destroying anything the user cannot get back from a file.
    store?.removeItem(STORAGE_KEY);

    return [];
  }
}

export function writeProjects(projects: readonly Project[]): boolean {
  const store = storage();

  if (!store) return false;

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(projects));

    return true;
  } catch {
    // Quota, or private mode refusing writes. A project list that silently
    // forgets is worse than one that says it could not save, which is why the
    // caller gets a boolean instead of an exception it has to remember to
    // catch.
    return false;
  }
}

export function upsertProject(project: Project, projects: readonly Project[]) {
  const index = projects.findIndex(
    (candidate) => candidate.record.id === project.record.id,
  );
  const next = [...projects];

  if (index >= 0) {
    next[index] = project;
  } else {
    next.unshift(project);
  }

  return next;
}

export function removeProject(id: string, projects: readonly Project[]) {
  return projects.filter((candidate) => candidate.record.id !== id);
}

/**
 * A record from a form, into a project carrying a scene.
 *
 * The scene is **not** built from the record's numbers. Area and floor count
 * describe a building; they do not say where its walls are, and a scene whose
 * walls were guessed from a floor count would look exactly like a measured one.
 * What the form's numbers do get used for is stated on the record's own terms
 * by `PlanSource`, and the caller decides which of the four plan routes runs —
 * `createSceneForPlan` is where that happens, and it is the only place that
 * turns a plan source into geometry.
 */
export function createProject(record: ProjectRecord, scene: CrowdSimScene): Project {
  // The record is taken as given rather than re-stamped: every field on it is
  // already typed, and a constructor that silently overwrote `contractVersion`
  // would make a v2 record load as a v1 one instead of being rejected.
  return { record, scene: parseScene(scene) };
}

function toProject(entry: unknown): Project | null {
  if (!entry || typeof entry !== "object") return null;

  const candidate = entry as { record?: unknown; scene?: unknown };

  if (!isRecord(candidate.record) || !candidate.scene) return null;

  const record = toRecord(candidate.record);

  if (!record) return null;

  // `safeParseScene` rather than `parseScene`: a hand-edited or truncated
  // project file must cost one project, not throw away the rest of the list.
  // It returns a result object, not the scene, so the success flag is the
  // check and `data` is the thing worth keeping.
  const parsed = safeParseScene(candidate.scene);

  return parsed.success ? { record, scene: parsed.data } : null;
}

function toRecord(entry: Record<string, unknown>): ProjectRecord | null {
  const id = text(entry.id);
  const name = text(entry.name);
  const lat = number(entry.lat);
  const lng = number(entry.lng);

  if (!id || !name || lat === null || lng === null) return null;

  return {
    contractVersion: 1,
    areaSquareMeters: number(entry.areaSquareMeters) ?? 0,
    // An unknown category falls back rather than passing through: this string
    // reaches `brandSchema`, which rejects anything it does not know, so
    // carrying a stale value forward would make the whole scene unparseable.
    businessCategory: businessCategory(entry.businessCategory),
    catchmentRadiusMeters: number(entry.catchmentRadiusMeters) ?? 800,
    coordinateSystem: "GCJ-02",
    createdAt: text(entry.createdAt) ?? new Date(0).toISOString(),
    floors: number(entry.floors) ?? 1,
    id,
    kind: entry.kind === "shop" ? "shop" : "mall",
    lat,
    lng,
    name,
    planSource: planSource(entry.planSource),
    updatedAt: text(entry.updatedAt) ?? new Date(0).toISOString(),
  };
}

function planSource(value: unknown): PlanSource {
  return value === "dxf" || value === "skeleton" || value === "glb" ? value : "drawn";
}

/**
 * The categories the schema accepts, spelled out once. `brandCategorySchema` is
 * not exported from the package's index, so the list is duplicated here — and
 * this test is what makes that duplication safe rather than a silent drift.
 *
 * Exported because two screens need it and the copy in each was the same copy.
 */
export const businessCategories: readonly BrandCategory[] = [
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

function businessCategory(value: unknown): BrandCategory {
  return businessCategories.includes(value as BrandCategory)
    ? (value as BrandCategory)
    : "dining";
}

/**
 * What each category is called in Chinese, beside the list it labels. The
 * record's own field is the English key, so a category with no label here
 * would render as its own slug — hence the `Record`, which says so at compile
 * time rather than on screen.
 */
export const categoryLabels: Record<BrandCategory, string> = {
  anchor: "主力店",
  coffee: "咖啡",
  cosmetics: "美妆",
  dining: "餐饮",
  electronics: "数码",
  entertainment: "娱乐",
  family: "亲子",
  fastFashion: "快时尚",
  grocery: "超市",
  jewelry: "珠宝",
  luxury: "奢侈品",
  restaurant: "正餐",
  service: "服务",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
