import { useState } from "react";
import type { TranslationKey } from "./i18n";
import type { EditorDocument, EditorZoneCategory } from "./sceneEditorState";
import { walkingGroupParameters } from "./walkingGroups";
import type {
  BuildingNumberField,
  EntranceNumberField,
  HazardNumberField,
  ObstacleNumberField,
  RoadNumberField,
  TransitStopNumberField,
  ZoneNumberField,
} from "./sceneEditorMutations";
import { populationLibrary } from "./populationSampling";
import { NumberInput, SelectInput } from "./SceneEditorParamInputs";

type Road = EditorDocument["roads"][number];
type Building = EditorDocument["buildings"][number];
type TransitStop = EditorDocument["transitStops"][number];
type Obstacle = EditorDocument["obstacles"][number];
type Hazard = EditorDocument["hazards"][number];
type Zone = EditorDocument["zones"][number];
type Connector = EditorDocument["connectors"][number];
type Entrance = EditorDocument["entrances"][number];

const entranceKinds: readonly Entrance["kind"][] = ["source", "sink", "bidirectional"];
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

export function RoadParamGrid({
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

export function BuildingParamGrid({
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
        label={t("storeys")}
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

export function TransitStopParamGrid({
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

export function ObstacleParamGrid({
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

const connectorKinds: readonly Connector["kind"][] = ["stair", "escalator", "elevator"];

/**
 * A stair, escalator or lift: what it is, and then its own parameters — a
 * stair/escalator is wide (how many people a second it passes, ADR-0008's
 * rule) and one- or two-way; a lift has a car capacity, a car count and a
 * door time instead (ADR-0010 stage 6), and running both ways is not a
 * choice for it, so that button is hidden rather than shown disabled.
 */
export function ConnectorParamGrid({
  onCapacityChange,
  onCarCountChange,
  onDoorSecondsChange,
  onKindChange,
  onToggleBidirectional,
  onWidthChange,
  selectedConnector,
  t,
}: {
  onCapacityChange: (value: number) => void;
  onCarCountChange: (value: number) => void;
  onDoorSecondsChange: (value: number) => void;
  onKindChange: (kind: Connector["kind"]) => void;
  onToggleBidirectional: () => void;
  onWidthChange: (value: number) => void;
  selectedConnector: Connector;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedConnector.id}</span>
      <SelectInput
        label={t("connectorKind")}
        options={connectorKinds}
        value={selectedConnector.kind}
        onChange={onKindChange}
      />
      {selectedConnector.kind === "elevator" ? (
        <>
          <NumberInput
            label={t("elevatorCapacity")}
            min={1}
            step={1}
            value={selectedConnector.capacity ?? 8}
            onChange={onCapacityChange}
          />
          <NumberInput
            label={t("elevatorCarCount")}
            min={1}
            step={1}
            value={selectedConnector.carCount ?? 1}
            onChange={onCarCountChange}
          />
          <NumberInput
            label={t("elevatorDoorSeconds")}
            min={0}
            step={0.5}
            value={selectedConnector.doorSeconds ?? 4}
            onChange={onDoorSecondsChange}
          />
        </>
      ) : (
        <>
          <NumberInput
            label={t("width")}
            min={0.6}
            step={0.1}
            value={selectedConnector.width}
            onChange={onWidthChange}
          />
          <button type="button" onClick={onToggleBidirectional}>
            {selectedConnector.bidirectional
              ? t("connectorBothWays")
              : `${selectedConnector.fromFloorId} → ${selectedConnector.toFloorId}`}
          </button>
        </>
      )}
    </div>
  );
}

export function HazardParamGrid({
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
      <NumberInput
        label={t("hazardVisibilityMultiplier")}
        min={0}
        step={0.05}
        value={selectedHazard.visibilityMultiplier}
        onChange={(value) => onNumberChange("visibilityMultiplier", value)}
      />
      {(selectedHazard.kind === "fire" || selectedHazard.kind === "smoke") && (
        <>
          <NumberInput
            label={t("hazardGrowthSeconds")}
            min={0.1}
            step={10}
            value={selectedHazard.growthSeconds}
            onChange={(value) => onNumberChange("growthSeconds", value)}
          />
          <p className="editor-param-note">{t("hazardSmokeDisclosure")}</p>
        </>
      )}
    </div>
  );
}

export function ZoneParamGrid({
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

/**
 * Entrances had no editor at all: you could draw a door and then had no way to
 * say how many people come through it. Arrival rate is the most consequential
 * input in a crowd model — it is what "how busy is this place" means — and it
 * was the one number that could only be changed by hand-editing JSON.
 */
/** "default" stands for "the scene says nothing", which is the engine's own. */
const populationChoices = ["default", ...populationLibrary.map((entry) => entry.id)];

export function EntranceParamGrid({
  onKindChange,
  onNumberChange,
  onPopulationChange,
  onProfileChange,
  selectedEntrance,
  t,
}: {
  onKindChange: (kind: Entrance["kind"]) => void;
  onPopulationChange: (populationId: string) => void;
  onProfileChange: (text: string) => void;
  onNumberChange: (field: EntranceNumberField, value: number) => void;
  selectedEntrance: Entrance;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="editor-param-grid">
      <span>{selectedEntrance.id}</span>
      <SelectInput
        label={t("entranceKind")}
        options={entranceKinds}
        value={selectedEntrance.kind}
        onChange={onKindChange}
      />
      {/* A pure exit spawns nobody, so the rate is not offered for one. */}
      {selectedEntrance.kind === "sink" ? null : (
        <>
          <NumberInput
            label={t("arrivalRate")}
            min={0}
            step={10}
            value={selectedEntrance.arrivalRatePerMinute}
            onChange={(value) => onNumberChange("arrivalRatePerMinute", value)}
          />
          <ProfileInput
            label={t("arrivalProfile")}
            rates={selectedEntrance.arrivalProfile?.ratesPerMinute}
            onChange={onProfileChange}
          />
          <NumberInput
            label={t("groupShare")}
            min={0}
            step={0.1}
            value={
              selectedEntrance.groupShare ??
              walkingGroupParameters.shareOfPeopleInGroups
            }
            onChange={(value) => onNumberChange("groupShare", value)}
          />
          {/* Who comes through this door (ADR-0011). */}
          <SelectInput
            label={t("population")}
            options={populationChoices}
            value={selectedEntrance.populationId ?? "default"}
            onChange={onPopulationChange}
          />
        </>
      )}
      <NumberInput
        label={t("width")}
        min={0.5}
        step={0.5}
        value={selectedEntrance.width}
        onChange={(value) => onNumberChange("width", value)}
      />
    </div>
  );
}

/**
 * A list typed as text: kept as typed while focused, so "60, " is not reformatted
 * under the cursor, and committed on blur.
 */
function ProfileInput({
  label,
  onChange,
  rates,
}: {
  label: string;
  onChange: (text: string) => void;
  rates?: readonly number[];
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="editor-param-wide">
      {label}
      <input
        type="text"
        inputMode="decimal"
        placeholder="60, 120, 90"
        value={draft ?? (rates ?? []).join(", ")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) onChange(draft);
          setDraft(null);
        }}
      />
    </label>
  );
}
