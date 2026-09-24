import type { TranslationKey } from "./i18n";
import type { BasemapNumberField, EditorBasemap } from "./sceneEditorBasemap";
import type { EditorDocument } from "./sceneEditorState";
import { NumberInput, SelectInput, TextInput } from "./SceneEditorParamInputs";
import { OutageWindowTimeline } from "./OutageWindowTimeline";

type Shop = EditorDocument["shops"][number];
type ServicePoint = EditorDocument["servicePoints"][number];
export function BasemapParamGrid({
  basemap,
  onNumberChange,
  onToggleLocked,
  onToggleVisible,
  t,
}: {
  basemap: EditorBasemap;
  onNumberChange: (field: BasemapNumberField, value: number) => void;
  onToggleLocked: () => void;
  onToggleVisible: () => void;
  t: (key: TranslationKey) => string;
}) {
  const imageDistancePixels = basemap.calibration
    ? Math.hypot(
        basemap.calibration.imagePointB.x - basemap.calibration.imagePointA.x,
        basemap.calibration.imagePointB.y - basemap.calibration.imagePointA.y,
      )
    : (basemap.widthMeters ?? 1);

  return (
    <div className="editor-param-grid">
      <span>{basemap.name ?? basemap.id}</span>
      <NumberInput
        label={t("basemapX")}
        min={-1000}
        step={1}
        value={basemap.transform.x}
        onChange={(value) => onNumberChange("x", value)}
      />
      <NumberInput
        label={t("basemapY")}
        min={-1000}
        step={1}
        value={basemap.transform.y}
        onChange={(value) => onNumberChange("y", value)}
      />
      <NumberInput
        label={t("basemapScale")}
        min={0.01}
        step={0.05}
        value={basemap.transform.scale}
        onChange={(value) => onNumberChange("scale", value)}
      />
      <NumberInput
        label={t("basemapRotation")}
        min={-360}
        step={1}
        value={basemap.transform.rotationDegrees}
        onChange={(value) => onNumberChange("rotationDegrees", value)}
      />
      <NumberInput
        label={t("basemapOpacity")}
        min={0}
        step={0.05}
        value={basemap.opacity}
        onChange={(value) => onNumberChange("opacity", value)}
      />
      <NumberInput
        label={t("width")}
        min={0.1}
        step={1}
        value={basemap.widthMeters ?? 1}
        onChange={(value) => onNumberChange("widthMeters", value)}
      />
      <NumberInput
        label={t("height")}
        min={0.1}
        step={1}
        value={basemap.heightMeters ?? 1}
        onChange={(value) => onNumberChange("heightMeters", value)}
      />
      <NumberInput
        label={t("basemapImageDistance")}
        min={1}
        step={1}
        value={imageDistancePixels}
        onChange={(value) => onNumberChange("imageDistancePixels", value)}
      />
      <NumberInput
        label={t("basemapRealDistance")}
        min={0.1}
        step={1}
        value={basemap.calibration?.realDistanceMeters ?? imageDistancePixels}
        onChange={(value) => onNumberChange("realDistanceMeters", value)}
      />
      <button type="button" onClick={onToggleLocked}>
        {basemap.locked ? t("basemapLocked") : t("basemapUnlocked")}
      </button>
      <button type="button" onClick={onToggleVisible}>
        {basemap.visible ? t("basemapVisible") : t("basemapHidden")}
      </button>
    </div>
  );
}

export function ShopParamGrid({
  onNumberChange,
  onSizeChange,
  selectedShop,
  t,
}: {
  onNumberChange: (
    field: "attraction" | "capacity" | "dwellMeanSeconds",
    value: number,
  ) => void;
  onSizeChange: (field: "height" | "width", value: number) => void;
  selectedShop: Shop;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedShop.id}</span>
      <NumberInput
        label={t("attraction")}
        min={0}
        step={0.1}
        value={selectedShop.attraction}
        onChange={(value) => onNumberChange("attraction", value)}
      />
      <NumberInput
        label={t("capacity")}
        min={1}
        step={1}
        value={selectedShop.capacity}
        onChange={(value) => onNumberChange("capacity", value)}
      />
      <NumberInput
        label={t("dwell")}
        min={1}
        step={10}
        value={selectedShop.dwellMeanSeconds}
        onChange={(value) => onNumberChange("dwellMeanSeconds", value)}
      />
      <NumberInput
        label={t("width")}
        min={1}
        step={1}
        value={selectedShop.size.width}
        onChange={(value) => onSizeChange("width", value)}
      />
      <NumberInput
        label={t("height")}
        min={1}
        step={1}
        value={selectedShop.size.height}
        onChange={(value) => onSizeChange("height", value)}
      />
    </div>
  );
}

/** No-next-stop sentinel: `SelectInput` needs a real string value, and "" is
 * never a real service point id (`idSchema` requires non-empty). */
const noNextServicePoint = "";

export function ServiceParamGrid({
  onNumberChange,
  onNextServicePointIdChange,
  onOutageWindowsChange,
  otherServicePointIds,
  selectedServicePoint,
  t,
}: {
  onNumberChange: (
    field: "capacityPerMinute" | "serviceMeanSeconds" | "width",
    value: number,
  ) => void;
  /** ADR-0021's chain. `undefined` for the "ends the chain here" option. */
  onNextServicePointIdChange: (nextServicePointId: string | undefined) => void;
  onOutageWindowsChange: (text: string) => void;
  /** Every other service point in the scene — never this one, so a scene
   * author cannot chain a stop to itself from this dropdown (a longer cycle
   * through other stops is still possible; `checkpointHopCount`'s safety cap
   * is what actually bounds that, not this list). */
  otherServicePointIds: readonly string[];
  selectedServicePoint: ServicePoint;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedServicePoint.id}</span>
      <NumberInput
        label={t("width")}
        min={1}
        step={1}
        value={selectedServicePoint.width}
        onChange={(value) => onNumberChange("width", value)}
      />
      <NumberInput
        label={t("serviceDuration")}
        min={1}
        step={1}
        value={selectedServicePoint.serviceMeanSeconds}
        onChange={(value) => onNumberChange("serviceMeanSeconds", value)}
      />
      <NumberInput
        label={t("capacityPerMinute")}
        min={0}
        step={1}
        value={selectedServicePoint.capacityPerMinute}
        onChange={(value) => onNumberChange("capacityPerMinute", value)}
      />
      <SelectInput
        label={t("nextServicePoint")}
        options={[noNextServicePoint, ...otherServicePointIds]}
        value={selectedServicePoint.nextServicePointId ?? noNextServicePoint}
        onChange={(value) =>
          onNextServicePointIdChange(value === noNextServicePoint ? undefined : value)
        }
      />
      {selectedServicePoint.outageWindows.length > 0 ? (
        <OutageWindowTimeline
          windows={selectedServicePoint.outageWindows}
          t={t}
          onChange={(windows) =>
            onOutageWindowsChange(
              windows
                .map((window) => `${window.startsAtSeconds}-${window.endsAtSeconds}`)
                .join(", "),
            )
          }
        />
      ) : null}
      <TextInput
        label={t("outageWindows")}
        placeholder="600-900, 1800-2000"
        value={selectedServicePoint.outageWindows
          .map((window) => `${window.startsAtSeconds}-${window.endsAtSeconds}`)
          .join(", ")}
        onChange={onOutageWindowsChange}
      />
    </div>
  );
}
