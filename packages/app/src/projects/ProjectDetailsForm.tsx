import { useState } from "react";
import { useI18n } from "../i18n";
import {
  businessCategories,
  categoryLabels,
  type BrandCategory,
  type PlanSource,
  type ProjectKind,
} from "./projectStore";

/**
 * Step 3: what kind of place this is, and where its floor plan comes from.
 *
 * **The four plan routes are the point of this screen.** A project can arrive
 * with a CAD drawing, be generated from floor-and-zone notes, be drawn by hand,
 * or come from a 3D model — and they are not variations on one thing. A DXF
 * gives walls with no openings. A generated skeleton gives walls, escalators
 * and doors it invented. A drawn plan has no source file. A GLB gives a model
 * that looks right and has no walls at all, so people walk through them. So the
 * screen states what each route produced instead of offering four buttons with
 * the same label.
 *
 * Area and floor count are recorded, and are **not** used to grow a plan: a
 * floor count is not a floor plan, and a scene whose walls were inferred from
 * one would be indistinguishable from a measured one once it is on screen.
 */

const planChoices: {
  source: PlanSource;
  zh: { label: string; produces: string };
  en: { label: string; produces: string };
}[] = [
  {
    source: "drawn",
    zh: {
      label: "自己画",
      produces: "进编辑器逐段画墙。最费事，但每一条墙都是你定的。",
    },
    en: {
      label: "Draw it",
      produces:
        "Open the editor and draw walls segment by segment. Slowest, and every wall is yours.",
    },
  },
  {
    source: "dxf",
    zh: {
      label: "上传 DXF / IFC",
      produces: "抽出墙体和轮廓。**门洞认不出来**，门要在导入后自己补。",
    },
    en: {
      label: "Upload DXF / IFC",
      produces:
        "Extracts walls and outlines. **Openings are not recognised** — doors have to be added afterwards.",
    },
  },
  {
    source: "skeleton",
    zh: {
      label: "按楼层生成",
      produces: "填每层用途，自动生成墙、店铺、扶梯和首层的门。扶梯位置是猜的。",
    },
    en: {
      label: "Generate from floors",
      produces:
        "Say what each floor is for; walls, shops, escalators and ground-floor doors appear. Escalator positions are guesses.",
    },
  },
  {
    source: "glb",
    zh: {
      label: "导入 GLB 模型",
      produces: "只有外观，**不产生墙体**。人可以在模型里走动，但仿真不知道墙在哪。",
    },
    en: {
      label: "Import a GLB model",
      produces:
        "Appearance only, **no walls**. People can walk through the model and the simulation would not know where the walls are.",
    },
  },
];

export type ProjectDetails = {
  areaSquareMeters: number;
  businessCategory: BrandCategory;
  floors: number;
  kind: ProjectKind;
  name: string;
  planSource: PlanSource;
};

export function ProjectDetailsForm({
  onCancel,
  onSubmit,
  place,
}: {
  onCancel: () => void;
  onSubmit: (details: ProjectDetails) => void;
  place: { lat: number; lng: number; radiusMeters: number };
}) {
  const { language } = useI18n();
  const zh = language === "zh";
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("mall");
  const [areaSquareMeters, setArea] = useState(3000);
  const [floors, setFloors] = useState(1);
  const [businessCategory, setBusinessCategory] = useState<BrandCategory>("dining");
  const [planSource, setPlanSource] = useState<PlanSource>("drawn");

  // The only thing that blocks submission is a name. Everything else has a
  // defensible default, and blocking on area or floor count would be asking
  // questions the person may not know yet.
  const canSubmit = name.trim().length > 0;

  return (
    <section
      className="project-details"
      aria-label={zh ? "项目信息" : "Project details"}
    >
      <p className="home-step-label">
        {zh ? "第 3 步 · 项目信息" : "Step 3 · Project details"}
      </p>
      <p className="project-details-where">
        {zh ? "位置" : "Location"}: {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
        {" · "}
        {Math.round(place.radiusMeters)} m
      </p>

      <label>
        {zh ? "项目名称" : "Name"}
        <input
          type="text"
          data-testid="details-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label>
        {zh ? "类型" : "Kind"}
        <select
          data-testid="details-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ProjectKind)}
        >
          <option value="mall">{zh ? "商场 / 多楼层" : "Mall / multi-floor"}</option>
          <option value="shop">{zh ? "单店 / 街边" : "Single shop / street"}</option>
        </select>
      </label>

      <label>
        {zh ? "经营类目" : "Business category"}
        <select
          data-testid="details-category"
          value={businessCategory}
          onChange={(event) => setBusinessCategory(event.target.value as BrandCategory)}
        >
          {businessCategories.map((category) => (
            <option key={category} value={category}>
              {categoryLabels[category]}
            </option>
          ))}
        </select>
      </label>

      <label>
        {zh ? "建筑面积（㎡）" : "Area (sq m)"}
        <input
          type="number"
          min="1"
          data-testid="details-area"
          value={areaSquareMeters}
          onChange={(event) => setArea(Number(event.target.value))}
        />
      </label>

      <label>
        {zh ? "楼层数" : "Floors"}
        <input
          type="number"
          min="1"
          data-testid="details-floors"
          value={floors}
          onChange={(event) => setFloors(Number(event.target.value))}
        />
      </label>

      <fieldset className="plan-source">
        <legend>{zh ? "平面从哪来" : "Where the floor plan comes from"}</legend>
        {planChoices.map((choice) => {
          const copy = zh ? choice.zh : choice.en;

          return (
            <label key={choice.source} className="plan-source-option">
              <input
                type="radio"
                name="plan-source"
                data-testid={`details-plan-${choice.source}`}
                checked={planSource === choice.source}
                onChange={() => setPlanSource(choice.source)}
              />
              <span>
                <strong>{copy.label}</strong>
                {/* The disclosure is the reason this is a radio with a paragraph
                    and not a select: what each route produces is a limit, and a
                    limit nobody reads becomes a promise nobody checked. */}
                <small>{copy.produces}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="project-details-note">
        {zh
          ? "面积和楼层数会被记下来，但不会拿去自动生成墙体 —— 楼层数不是平面图。"
          : "Area and floor count are recorded but not used to grow walls: a floor count is not a floor plan."}
      </p>

      <div className="project-details-actions">
        <button type="button" data-testid="details-cancel" onClick={onCancel}>
          {zh ? "返回" : "Back"}
        </button>
        <button
          type="button"
          data-testid="details-submit"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              areaSquareMeters,
              businessCategory,
              floors,
              kind,
              name: name.trim(),
              planSource,
            })
          }
        >
          {zh ? "创建项目" : "Create project"}
        </button>
      </div>
    </section>
  );
}
