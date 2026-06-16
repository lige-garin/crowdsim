import type { TranslationKey } from "./i18n";
import type { BasemapNumberField, EditorBasemap } from "./sceneEditorBasemap";
import type { EditorDocument, EditorZoneCategory } from "./sceneEditorState";
import type {
  BuildingNumberField,
  HazardNumberField,
  ObstacleNumberField,
  RoadNumberField,
  TransitStopNumberField,
  ZoneNumberField,
} from "./sceneEditorMutations";

type Road = EditorDocument["roads"][number];
type Building = EditorDocument["buildings"][number];
type TransitStop = EditorDocument["transitStops"][number];
type Obstacle = EditorDocument["obstacles"][number];
type Hazard = EditorDocument["hazards"][number];
type Shop = EditorDocument["shops"][number];
type ServicePoint = EditorDocument["servicePoints"][number];
type CountLine = EditorDocument["countLines"][number];
type Zone = EditorDocument["zones"][number];

type SceneEditorParamPanelProps = {
  basemap: EditorBasemap | null;
  onBasemapNumberChange: (field: BasemapNumberField, value: number) => void;
  onBuildingKindChange: (kind: Building["kind"]) => void;
  onBuildingNumberChange: (field: BuildingNumberField, value: number) => void;
  onHazardKindChange: (kind: Hazard["kind"]) => void;
  onHazardNumberChange: (field: HazardNumberField, value: number) => void;
  onObstacleKindChange: (kind: Obstacle["kind"]) => void;
  onObstacleNumberChange: (field: ObstacleNumberField, value: number) => void;
  onRoadDirectionChange: (direction: Road["direction"]) => void;
  onRoadNumberChange: (field: RoadNumberField, value: number) => void;
  onServiceNumberChange: (
    field: "capacityPerMinute" | "serviceMeanSeconds" | "width",
    value: number,
  ) => void;
  onShopNumberChange: (
    field: "attraction" | "capacity" | "dwellMeanSeconds",
    value: number,
  ) => void;
  onShopSizeChange: (field: "height" | "width", value: number) => void;
  onToggleBasemapLocked: () => void;
  onToggleBasemapVisible: () => void;
  onToggleObstacleBlocksMovement: () => void;
  onToggleRoadTransitOnly: () => void;
  onToggleRoadWalkable: () => void;
  onToggleTransitStopActive: () => void;
  onToggleZoneWalkable: () => void;
  onGenerateZoneStores: () => void;
  onTransitStopKindChange: (kind: TransitStop["kind"]) => void;
  onTransitStopNumberChange: (field: TransitStopNumberField, value: number) => void;
  onZoneCategoryChange: (category: EditorZoneCategory) => void;
  onZoneNumberChange: (field: ZoneNumberField, value: number) => void;
  pointsToSvg: (points: CountLine["points"]) => string;
  selectedBuilding: Building | undefined;
  selectedCountLine: CountLine | undefined;
  selectedHazard: Hazard | undefined;
  selectedObstacle: Obstacle | undefined;
  selectedRoad: Road | undefined;
  selectedServicePoint: ServicePoint | undefined;
  selectedShop: Shop | undefined;
  selectedTransitStop: TransitStop | undefined;
  selectedZone: Zone | undefined;
  t: (key: TranslationKey) => string;
};

export function SceneEditorParamPanel({
  basemap,
  onBasemapNumberChange,
  onBuildingKindChange,
  onBuildingNumberChange,
  onHazardKindChange,
  onHazardNumberChange,
  onObstacleKindChange,
  onObstacleNumberChange,
  onRoadDirectionChange,
  onRoadNumberChange,
  onServiceNumberChange,
  onShopNumberChange,
  onShopSizeChange,
  onToggleObstacleBlocksMovement,
  onToggleRoadTransitOnly,
  onToggleRoadWalkable,
  onToggleBasemapLocked,
  onToggleBasemapVisible,
  onToggleTransitStopActive,
  onToggleZoneWalkable,
  onGenerateZoneStores,
  onTransitStopKindChange,
  onTransitStopNumberChange,
  onZoneCategoryChange,
  onZoneNumberChange,
  pointsToSvg,
  selectedBuilding,
  selectedCountLine,
  selectedHazard,
  selectedObstacle,
  selectedRoad,
  selectedServicePoint,
  selectedShop,
  selectedTransitStop,
  selectedZone,
  t,
}: SceneEditorParamPanelProps) {
  return (
    <div className="editor-param-panel" aria-label={t("objectParameterPanel")}>
      <h3>{t("parameters")}</h3>
      {selectedShop ? (
        <ShopParamGrid
          onNumberChange={onShopNumberChange}
          onSizeChange={onShopSizeChange}
          selectedShop={selectedShop}
          t={t}
        />
      ) : selectedRoad ? (
        <RoadParamGrid
          onDirectionChange={onRoadDirectionChange}
          onNumberChange={onRoadNumberChange}
          onToggleTransitOnly={onToggleRoadTransitOnly}
          onToggleWalkable={onToggleRoadWalkable}
          selectedRoad={selectedRoad}
          t={t}
        />
      ) : selectedBuilding ? (
        <BuildingParamGrid
          onKindChange={onBuildingKindChange}
          onNumberChange={onBuildingNumberChange}
          selectedBuilding={selectedBuilding}
          t={t}
        />
      ) : selectedTransitStop ? (
        <TransitStopParamGrid
          onKindChange={onTransitStopKindChange}
          onNumberChange={onTransitStopNumberChange}
          onToggleActive={onToggleTransitStopActive}
          selectedTransitStop={selectedTransitStop}
          t={t}
        />
      ) : selectedObstacle ? (
        <ObstacleParamGrid
          onKindChange={onObstacleKindChange}
          onNumberChange={onObstacleNumberChange}
          onToggleBlocksMovement={onToggleObstacleBlocksMovement}
          selectedObstacle={selectedObstacle}
          t={t}
        />
      ) : selectedHazard ? (
        <HazardParamGrid
          onKindChange={onHazardKindChange}
          onNumberChange={onHazardNumberChange}
          selectedHazard={selectedHazard}
          t={t}
        />
      ) : selectedServicePoint ? (
        <ServiceParamGrid
          onNumberChange={onServiceNumberChange}
          selectedServicePoint={selectedServicePoint}
          t={t}
        />
      ) : selectedCountLine ? (
        <div className="editor-param-grid">
          <span>{selectedCountLine.id}</span>
          <span>{pointsToSvg(selectedCountLine.points)}</span>
        </div>
      ) : selectedZone ? (
        <ZoneParamGrid
          onCategoryChange={onZoneCategoryChange}
          onGenerateStores={onGenerateZoneStores}
          onNumberChange={onZoneNumberChange}
          onToggleWalkable={onToggleZoneWalkable}
          selectedZone={selectedZone}
          t={t}
        />
      ) : basemap ? (
        <BasemapParamGrid
          basemap={basemap}
          onNumberChange={onBasemapNumberChange}
          onToggleLocked={onToggleBasemapLocked}
          onToggleVisible={onToggleBasemapVisible}
          t={t}
        />
      ) : (
        <span>{t("noObjectSelected")}</span>
      )}
    </div>
  );
}

const roadDirections: readonly Road["direction"][] = [
  "twoWay",
  "oneWayForward",
  "oneWayBackward",
];

const buildingKinds: readonly Building["kind"][] = [
  "mixedUse",
  "retail",
  "office",
  "residential",
  "transit",
  "civic",
  "shelter",
  "utility",
];

const transitStopKinds: readonly TransitStop["kind"][] = [
  "bus",
  "metro",
  "tram",
  "shuttle",
  "taxi",
  "rideHail",
];

const obstacleKinds: readonly Obstacle["kind"][] = [
  "constructionBarrier",
  "debris",
  "fence",
  "landscape",
  "securityLine",
  "water",
];

const hazardKinds: readonly Hazard["kind"][] = [
  "roadClosure",
  "flood",
  "fire",
  "smoke",
  "crowdSurge",
  "powerOutage",
  "securityIncident",
  "transitDisruption",
];

const zoneCategories: readonly EditorZoneCategory[] = [
  "mixed",
  "jewelry",
  "cosmetics",
  "dining",
  "fashion",
  "service",
  "entertainment",
  "anchor",
  "corridor",
  "atrium",
  "emergency",
  "electronics",
  "grocery",
];

function RoadParamGrid({
  onDirectionChange,
  onNumberChange,
  onToggleTransitOnly,
  onToggleWalkable,
  selectedRoad,
  t,
}: {
  onDirectionChange: (direction: Road["direction"]) => void;
  onNumberChange: (field: RoadNumberField, value: number) => void;
  onToggleTransitOnly: () => void;
  onToggleWalkable: () => void;
  selectedRoad: Road;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedRoad.id}</span>
      <SelectInput
        label={t("roadDirection")}
        options={roadDirections}
        value={selectedRoad.direction}
        onChange={onDirectionChange}
      />
      <NumberInput
        label={t("roadWidth")}
        min={0.1}
        step={0.5}
        value={selectedRoad.widthMeters}
        onChange={(value) => onNumberChange("widthMeters", value)}
      />
      <NumberInput
        label={t("speedLimit")}
        min={0.1}
        step={0.1}
        value={selectedRoad.speedLimitMetersPerSecond}
        onChange={(value) => onNumberChange("speedLimitMetersPerSecond", value)}
      />
      <NumberInput
        label={t("capacityPerMinute")}
        min={0}
        step={10}
        value={selectedRoad.capacityPerMinute}
        onChange={(value) => onNumberChange("capacityPerMinute", value)}
      />
      <button type="button" onClick={onToggleWalkable}>
        {selectedRoad.walkable ? t("walkable") : t("blocked")}
      </button>
      <button type="button" onClick={onToggleTransitOnly}>
        {selectedRoad.transitOnly ? t("transitOnly") : t("mixedTraffic")}
      </button>
    </div>
  );
}

function BuildingParamGrid({
  onKindChange,
  onNumberChange,
  selectedBuilding,
  t,
}: {
  onKindChange: (kind: Building["kind"]) => void;
  onNumberChange: (field: BuildingNumberField, value: number) => void;
  selectedBuilding: Building;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedBuilding.id}</span>
      <SelectInput
        label={t("buildingKind")}
        options={buildingKinds}
        value={selectedBuilding.kind}
        onChange={onKindChange}
      />
      <NumberInput
        label={t("heightMeters")}
        min={1}
        step={1}
        value={selectedBuilding.heightMeters}
        onChange={(value) => onNumberChange("heightMeters", value)}
      />
      <NumberInput
        label={t("floors")}
        min={1}
        step={1}
        value={selectedBuilding.floors}
        onChange={(value) => onNumberChange("floors", value)}
      />
      <NumberInput
        label={t("residentCapacity")}
        min={0}
        step={10}
        value={selectedBuilding.residentCapacity}
        onChange={(value) => onNumberChange("residentCapacity", value)}
      />
      <NumberInput
        label={t("workerCapacity")}
        min={0}
        step={10}
        value={selectedBuilding.workerCapacity}
        onChange={(value) => onNumberChange("workerCapacity", value)}
      />
      <NumberInput
        label={t("visitorCapacity")}
        min={0}
        step={10}
        value={selectedBuilding.visitorCapacity}
        onChange={(value) => onNumberChange("visitorCapacity", value)}
      />
    </div>
  );
}

function TransitStopParamGrid({
  onKindChange,
  onNumberChange,
  onToggleActive,
  selectedTransitStop,
  t,
}: {
  onKindChange: (kind: TransitStop["kind"]) => void;
  onNumberChange: (field: TransitStopNumberField, value: number) => void;
  onToggleActive: () => void;
  selectedTransitStop: TransitStop;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedTransitStop.id}</span>
      <SelectInput
        label={t("transitKind")}
        options={transitStopKinds}
        value={selectedTransitStop.kind}
        onChange={onKindChange}
      />
      <NumberInput
        label={t("capacity")}
        min={1}
        step={1}
        value={selectedTransitStop.capacity}
        onChange={(value) => onNumberChange("capacity", value)}
      />
      <NumberInput
        label={t("arrivalInterval")}
        min={1}
        step={30}
        value={selectedTransitStop.arrivalIntervalSeconds}
        onChange={(value) => onNumberChange("arrivalIntervalSeconds", value)}
      />
      <NumberInput
        label={t("alighting")}
        min={0}
        step={1}
        value={selectedTransitStop.alightingPerArrival}
        onChange={(value) => onNumberChange("alightingPerArrival", value)}
      />
      <NumberInput
        label={t("boardingRate")}
        min={0}
        step={5}
        value={selectedTransitStop.boardingCapacityPerMinute}
        onChange={(value) => onNumberChange("boardingCapacityPerMinute", value)}
      />
      <NumberInput
        label={t("delayFactor")}
        min={1}
        step={0.05}
        value={selectedTransitStop.delayFactor}
        onChange={(value) => onNumberChange("delayFactor", value)}
      />
      <button type="button" onClick={onToggleActive}>
        {selectedTransitStop.active ? t("active") : t("inactive")}
      </button>
    </div>
  );
}

function ObstacleParamGrid({
  onKindChange,
  onNumberChange,
  onToggleBlocksMovement,
  selectedObstacle,
  t,
}: {
  onKindChange: (kind: Obstacle["kind"]) => void;
  onNumberChange: (field: ObstacleNumberField, value: number) => void;
  onToggleBlocksMovement: () => void;
  selectedObstacle: Obstacle;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedObstacle.id}</span>
      <SelectInput
        label={t("obstacleKind")}
        options={obstacleKinds}
        value={selectedObstacle.kind}
        onChange={onKindChange}
      />
      <NumberInput
        label={t("routeCostMultiplier")}
        min={0}
        step={0.25}
        value={selectedObstacle.routeCostMultiplier}
        onChange={(value) => onNumberChange("routeCostMultiplier", value)}
      />
      <button type="button" onClick={onToggleBlocksMovement}>
        {selectedObstacle.blocksMovement ? t("blocksMovement") : t("softObstacle")}
      </button>
    </div>
  );
}

function HazardParamGrid({
  onKindChange,
  onNumberChange,
  selectedHazard,
  t,
}: {
  onKindChange: (kind: Hazard["kind"]) => void;
  onNumberChange: (field: HazardNumberField, value: number) => void;
  selectedHazard: Hazard;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedHazard.id}</span>
      <SelectInput
        label={t("hazardKind")}
        options={hazardKinds}
        value={selectedHazard.kind}
        onChange={onKindChange}
      />
      <NumberInput
        label={t("radiusMeters")}
        min={1}
        step={1}
        value={selectedHazard.radiusMeters}
        onChange={(value) => onNumberChange("radiusMeters", value)}
      />
      <NumberInput
        label={t("startsAtSeconds")}
        min={0}
        step={60}
        value={selectedHazard.startsAtSeconds}
        onChange={(value) => onNumberChange("startsAtSeconds", value)}
      />
      <NumberInput
        label={t("severity")}
        min={0}
        step={0.05}
        value={selectedHazard.severity}
        onChange={(value) => onNumberChange("severity", value)}
      />
      <NumberInput
        label={t("speedMultiplier")}
        min={0}
        step={0.05}
        value={selectedHazard.speedMultiplier}
        onChange={(value) => onNumberChange("speedMultiplier", value)}
      />
      <NumberInput
        label={t("routeCostMultiplier")}
        min={0}
        step={0.25}
        value={selectedHazard.routeCostMultiplier}
        onChange={(value) => onNumberChange("routeCostMultiplier", value)}
      />
      <NumberInput
        label={t("riskScore")}
        min={0}
        step={0.05}
        value={selectedHazard.riskScore}
        onChange={(value) => onNumberChange("riskScore", value)}
      />
    </div>
  );
}

function ZoneParamGrid({
  onCategoryChange,
  onGenerateStores,
  onNumberChange,
  onToggleWalkable,
  selectedZone,
  t,
}: {
  onCategoryChange: (category: EditorZoneCategory) => void;
  onGenerateStores: () => void;
  onNumberChange: (field: ZoneNumberField, value: number) => void;
  onToggleWalkable: () => void;
  selectedZone: Zone;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedZone.id}</span>
      <label>
        {t("zoneCategory")}
        <select
          value={selectedZone.category}
          onChange={(event) =>
            onCategoryChange(event.target.value as EditorZoneCategory)
          }
        >
          {zoneCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <NumberInput
        label={t("attraction")}
        min={0}
        step={0.05}
        value={selectedZone.attraction}
        onChange={(value) => onNumberChange("attraction", value)}
      />
      <NumberInput
        label={t("dwell")}
        min={1}
        step={10}
        value={selectedZone.dwellMeanSeconds}
        onChange={(value) => onNumberChange("dwellMeanSeconds", value)}
      />
      <button type="button" onClick={onToggleWalkable}>
        {selectedZone.walkable ? t("zoneWalkable") : t("zoneBlocked")}
      </button>
      <button type="button" onClick={onGenerateStores}>
        {t("generateStores")}
      </button>
    </div>
  );
}

function BasemapParamGrid({
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

function ShopParamGrid({
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

function ServiceParamGrid({
  onNumberChange,
  selectedServicePoint,
  t,
}: {
  onNumberChange: (
    field: "capacityPerMinute" | "serviceMeanSeconds" | "width",
    value: number,
  ) => void;
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
    </div>
  );
}

function NumberInput({
  label,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectInput<TValue extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: TValue) => void;
  options: readonly TValue[];
  value: TValue;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
