import { floorLabel } from "./sceneEditorFloors";

export type SwitchableFloor = {
  id: string;
  name?: string;
  level: number;
  elevationMeters: number;
};

/**
 * The floors of a scene as a row of buttons, lowest first.
 *
 * Shared by the editor (which floor is being drawn) and the stage (which floor
 * is being watched), because they are the same question asked twice and a
 * building's floors should be listed the same way in both.
 */
export function FloorSwitcher({
  activeFloorId,
  floors,
  onSelect,
}: {
  activeFloorId: string | undefined;
  floors: readonly SwitchableFloor[];
  onSelect: (floorId: string) => void;
}) {
  return (
    <>
      {floors.map((floor) => (
        <button
          type="button"
          key={floor.id}
          className="editor-floor"
          data-testid={`editor-floor-${floor.id}`}
          aria-pressed={floor.id === activeFloorId}
          onClick={() => onSelect(floor.id)}
        >
          {floorLabel(floor)}
        </button>
      ))}
    </>
  );
}
