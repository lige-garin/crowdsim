import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import {
  categoryLabels,
  readProjects,
  removeProject,
  upsertProject,
  writeProjects,
  type PlanSource,
  type Project,
  type ProjectKind,
} from "./projectStore";

/**
 * The project's front door: what exists, and a way in.
 *
 * It replaced a gallery of industry templates (metro concourse, airport
 * security, hospital outpatient — none of them a place anyone is about to
 * open) with the projects this person actually has. The templates are still
 * one click away, under "start from a template", because a demo scene is a
 * legitimate way to find out what the tool does.
 *
 * What a card can say is bounded by what the record holds, and it says no more:
 * a project's area and floor count describe a building, they do not say the
 * plan has been drawn. So a card with no geometry yet says "plan not drawn"
 * rather than showing a floor count as though it were a floor plan.
 */

const kindLabels: Record<ProjectKind, { zh: string; en: string }> = {
  mall: { zh: "商场", en: "Mall" },
  shop: { zh: "单店", en: "Single shop" },
};

const planLabels: Record<PlanSource, { zh: string; en: string }> = {
  drawn: { zh: "未画平面", en: "No plan yet" },
  dxf: { zh: "来自 DXF", en: "From DXF" },
  skeleton: { zh: "骨架生成", en: "Generated" },
  glb: { zh: "来自 GLB（仅外观）", en: "From GLB (visual only)" },
};

export function ProjectList({
  onCreate,
  onOpen,
}: {
  onCreate: () => void;
  onOpen: (project: Project) => void;
}) {
  const { language } = useI18n();
  const zh = language === "zh";
  // Read once, lazily, on the first render. An effect that set it would be a
  // second render pass to deliver a value that was available immediately —
  // and the store's read is not free, so it must not run on every render
  // either. Nothing else in the app writes projects yet; a second writer is
  // what would make live syncing worth wiring.
  const [projects, setProjects] = useState<Project[]>(readProjects);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...projects].sort((a, b) =>
        b.record.updatedAt.localeCompare(a.record.updatedAt),
      ),
    [projects],
  );

  const save = (next: Project[]) => {
    // The list is the screen; if it cannot be written the user has to be told,
    // because everything else on this screen would then be describing work
    // that is not actually kept.
    if (!writeProjects(next)) {
      setError(
        zh
          ? "浏览器拒绝保存（可能是存储空间已满或隐私模式）。这一页显示的内容没有存下来。"
          : "The browser refused to save (storage full, or private mode). What this page shows is not stored.",
      );
    } else {
      setError(null);
    }

    setProjects(next);
  };

  const duplicate = (project: Project) => {
    const id = `p-${Date.now().toString(36)}`;
    const copy: Project = {
      record: {
        ...project.record,
        id,
        name: `${project.record.name}（副本）`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      scene: { ...project.scene, id: `${project.scene.id}-${id}` },
    };

    save(upsertProject(copy, projects));
  };

  return (
    <section className="project-list" aria-label={zh ? "我的项目" : "My projects"}>
      <div className="project-list-head">
        <div>
          <h2>{zh ? "我的项目" : "My projects"}</h2>
          <p>
            {zh
              ? "项目只存在这台电脑的浏览器里，不上传，也没有账号。导出成文件才能带走。"
              : "Projects live in this browser on this machine. Nothing is uploaded and there is no account. Export a project to take it elsewhere."}
          </p>
        </div>
        <button type="button" data-testid="project-create" onClick={onCreate}>
          {zh ? "新建项目" : "New project"}
        </button>
      </div>

      {error ? (
        <p className="project-list-error" data-testid="project-list-error">
          {error}
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <p data-testid="project-list-empty">
          {zh
            ? "还没有项目。新建一个，或者先拿一个模板看看能跑出什么。"
            : "No projects yet. Create one, or open a template to see what this does."}
        </p>
      ) : (
        <ul className="project-cards">
          {sorted.map((project) => (
            <li key={project.record.id}>
              <article className="project-card">
                <h3>{project.record.name}</h3>
                <p className="project-card-where">
                  {project.record.lat.toFixed(5)}, {project.record.lng.toFixed(5)}
                  {" · "}
                  {Math.round(project.record.catchmentRadiusMeters)} m
                </p>
                <div className="project-card-tags">
                  <span>{kindLabels[project.record.kind][language]}</span>
                  <span>{categoryLabels[project.record.businessCategory]}</span>
                  <span>{Math.round(project.record.areaSquareMeters)} ㎡</span>
                  <span>
                    {project.record.floors}
                    {zh ? " 层" : project.record.floors === 1 ? " floor" : " floors"}
                  </span>
                </div>
                <p className="project-card-plan">
                  {planLabels[project.record.planSource][language]}
                </p>
                <div className="project-card-actions">
                  <button
                    type="button"
                    data-testid={`project-open-${project.record.id}`}
                    onClick={() => onOpen(project)}
                  >
                    {zh ? "打开" : "Open"}
                  </button>
                  <button type="button" onClick={() => duplicate(project)}>
                    {zh ? "复制" : "Duplicate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => save(removeProject(project.record.id, projects))}
                  >
                    {zh ? "删除" : "Delete"}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
