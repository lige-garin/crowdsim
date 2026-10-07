import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { ProjectDetailsForm, type ProjectDetails } from "./ProjectDetailsForm";

afterEach(cleanup);

const place = { lat: 41.8057, lng: 123.4315, radiusMeters: 800 };

function renderForm(onSubmit: (details: ProjectDetails) => void = () => {}) {
  render(
    <I18nProvider>
      <ProjectDetailsForm onCancel={() => {}} onSubmit={onSubmit} place={place} />
    </I18nProvider>,
  );
}

function set(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe("ProjectDetailsForm", () => {
  it("will not create a project without a name, and says nothing is missing", () => {
    renderForm();

    expect(screen.getByTestId("details-submit")).toBeDisabled();

    set("details-name", "中街商场");
    expect(screen.getByTestId("details-submit")).toBeEnabled();
  });

  it("hands on everything the form collected", () => {
    const submitted: ProjectDetails[] = [];

    renderForm((details) => {
      submitted.push(details);
    });

    set("details-name", " 中街商场 ");
    set("details-kind", "shop");
    set("details-category", "coffee");
    set("details-area", "180");
    set("details-floors", "3");
    fireEvent.click(screen.getByTestId("details-plan-dxf"));
    fireEvent.click(screen.getByTestId("details-submit"));

    expect(submitted[0]).toEqual({
      areaSquareMeters: 180,
      businessCategory: "coffee",
      floors: 3,
      kind: "shop",
      name: "中街商场",
      planSource: "dxf",
    });
  });

  it("shows where the project is, because the form cannot change it", () => {
    renderForm();

    expect(document.body.textContent).toContain("41.80570");
    expect(document.body.textContent).toContain("800 m");
  });

  it("offers four ways to get a plan and says what each one produces", () => {
    renderForm();

    for (const source of ["drawn", "dxf", "skeleton", "glb"]) {
      expect(screen.getByTestId(`details-plan-${source}`)).toBeInTheDocument();
    }

    // Not labels alone. What each route produces is the whole difference
    // between them, and a label the reader has to already understand is a
    // promise nobody checked.
    expect(document.body.textContent).toMatch(/门洞认不出来/);
    expect(document.body.textContent).toMatch(/不产生墙体/);
  });

  it("defaults to drawing it, which is the route that produces no walls yet", () => {
    // Collected in an array rather than assigned to a `let`: TypeScript widens
    // a closure-assigned `let` to `never` after the first read, because from
    // its side the callback provably runs before the assertion.
    const submitted: ProjectDetails[] = [];

    renderForm((details) => {
      submitted.push(details);
    });

    set("details-name", "新项目");
    fireEvent.click(screen.getByTestId("details-submit"));

    expect(submitted[0]?.planSource).toBe("drawn");
  });

  it("says the area and floors are recorded but not drawn from", () => {
    renderForm();

    // The temptation is to grow a box from these two numbers, and a box that
    // looks surveyed is worse than an empty world because it hides the fact
    // that nobody has drawn anything.
    expect(document.body.textContent).toMatch(/楼层数不是平面图/);
  });

  it("shows no markdown asterisks, because nothing here renders markdown", () => {
    renderForm();

    // These strings were written with `**emphasis**` and the asterisks went
    // straight onto the screen. The limit on a route is the most important
    // thing on this page, and it has to be readable to count.
    expect(document.body.textContent).not.toContain("*");
  });

  it("emphasises the limit on each route as an element, not as punctuation", () => {
    renderForm();

    // The bolded phrase is the whole difference between the route and a
    // promise, so it has to be marked up as emphasis rather than sitting in
    // the run of text where it can be missed.
    for (const phrase of ["门洞认不出来", "扶梯位置是猜的", "不产生墙体"]) {
      expect(screen.getByText(phrase).tagName).toBe("B");
    }
  });
});

describe("the placeholder shop, told about before it appears", () => {
  it("says the box in the middle of the site is a placeholder", () => {
    renderForm();

    // The engine needs a shop to simulate at all, so a new project opens with
    // one in the middle of the world. Nobody measured it, and the workbench
    // is the only screen where that is visible — so it is said here.
    const note = screen.getByTestId("details-placeholder-note");

    expect(note.textContent).toMatch(/占位/);
    expect(note.textContent).toMatch(/没有量测过的尺寸/);
  });

  it("tells a skeleton project which parts of the plan are real", () => {
    renderForm();

    fireEvent.click(screen.getByTestId("details-plan-skeleton"));

    // Skeleton also produces genuine store lots, so the honest sentence
    // separates the two rather than calling the whole plan invented.
    const note = screen.getByTestId("details-placeholder-note");

    expect(note.textContent).toMatch(/店铺地块是真的/);
    expect(note.textContent).toMatch(/扶梯位置是猜的/);
  });
});
