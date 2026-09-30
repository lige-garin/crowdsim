import type { TranslationKey } from "../i18n";
import { FloorSwitcher } from "./FloorSwitcher";
import { editorFloors } from "./sceneEditorFloors";
import type { EditorDocument } from "./sceneEditorState";

/**
 * Which floor is being drawn, and a way to add one (ADR-0010 stage 1).
 *
 * A scene with no floors shows only the add button: there is one plane, and a
 * chooser between one thing would say nothing.
 *
 * Adding a floor is only half of a building: until a stair or escalator joins
 * them, the floor that has no way to an exit strands whoever is on it.
 */
export function SceneEditorFloorBar({
  document,
  onAddFloor,
  onSelectFloor,
  t,
}: {
  document: EditorDocument;
  onAddFloor: () => void;
  onSelectFloor: (floorId: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const floors = editorFloors(document);

  return (
    <div
      className="editor-floorbar"
      aria-label={t("floors")}
      data-testid="editor-floors"
      title={t("floorsNote")}
    >
      <span className="editor-floorbar-label">{t("floors")}</span>
      <FloorSwitcher
        activeFloorId={document.activeFloorId}
        floors={floors}
        onSelect={onSelectFloor}
      />
      <button
        type="button"
        className="editor-floor editor-floor-add"
        data-testid="editor-add-floor"
        onClick={onAddFloor}
      >
        {t("floorAdd")}
      </button>
    </div>
  );
}
