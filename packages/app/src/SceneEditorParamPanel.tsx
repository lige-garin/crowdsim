import type { TranslationKey } from "./i18n";
import type { BasemapNumberField, EditorBasemap } from "./sceneEditorBasemap";
import type { EditorDocument, EditorZoneCategory } from "./sceneEditorState";
import type {
  BuildingNumberField,
  CrosswalkNumberField,
  EntranceNumberField,
  HazardNumberField,
  ObstacleNumberField,
  RoadNumberField,
  TransitStopNumberField,
  ZoneNumberField,
} from "./sceneEditorMutations";
import {
  BuildingParamGrid,
  ConnectorParamGrid,
  CrosswalkParamGrid,
  EntranceParamGrid,
  HazardParamGrid,
  ObstacleParamGrid,
  RoadParamGrid,
  TransitStopParamGrid,
  ZoneParamGrid,
} from "./SceneEditorFacilityParamGrids";
import {
  BasemapParamGrid,
  ServiceParamGrid,
  ShopParamGrid,
} from "./SceneEditorRetailParamGrids";

type Road = EditorDocument["roads"][number];
type Building = EditorDocument["buildings"][number];
type TransitStop = EditorDocument["transitStops"][number];
type Crosswalk = EditorDocument["crosswalks"][number];
type Obstacle = EditorDocument["obstacles"][number];
type Hazard = EditorDocument["hazards"][number];
type Shop = EditorDocument["shops"][number];
type ServicePoint = EditorDocument["servicePoints"][number];
type CountLine = EditorDocument["countLines"][number];
type Connector = EditorDocument["connectors"][number];
type Zone = EditorDocument["zones"][number];
type Entrance = EditorDocument["entrances"][number];

type SceneEditorParamPanelProps = {
  basemap: EditorBasemap | null;
  onBasemapNumberChange: (field: BasemapNumberField, value: number) => void;
  onBuildingKindChange: (kind: Building["kind"]) => void;
  onEntranceKindChange: (kind: Entrance["kind"]) => void;
  onEntrancePopulationChange: (populationId: string) => void;
  onEntranceProfileChange: (text: string) => void;
  onEntranceNumberChange: (field: EntranceNumberField, value: number) => void;
  onBuildingNumberChange: (field: BuildingNumberField, value: number) => void;
  onConnectorCapacityChange: (value: number) => void;
  onConnectorCarCountChange: (value: number) => void;
  onConnectorDoorSecondsChange: (value: number) => void;
  onConnectorKindChange: (kind: Connector["kind"]) => void;
  onConnectorWidthChange: (value: number) => void;
  onToggleConnectorBidirectional: () => void;
  onCountLineNameChange: (name: string) => void;
  onCrosswalkNumberChange: (field: CrosswalkNumberField, value: number) => void;
  onCrosswalkRoadIdChange: (roadId: string) => void;
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
  onServiceNextIdChange: (nextServicePointId: string | undefined) => void;
  onServiceOutageWindowsChange: (text: string) => void;
  onShopNumberChange: (
    field: "attraction" | "capacity" | "dwellMeanSeconds",
    value: number,
  ) => void;
  onShopSizeChange: (field: "height" | "width", value: number) => void;
  onToggleBasemapLocked: () => void;
  onToggleBasemapVisible: () => void;
  onToggleObstacleBlocksMovement: () => void;
  onToggleRoadTransitOnly: () => void;
  onToggleRoadVehicleAccessible: () => void;
  onToggleRoadWalkable: () => void;
  onToggleTransitStopActive: () => void;
  onToggleZoneWalkable: () => void;
  onGenerateZoneStores: () => void;
  onTransitStopKindChange: (kind: TransitStop["kind"]) => void;
  onTransitStopNumberChange: (field: TransitStopNumberField, value: number) => void;
  onZoneCategoryChange: (category: EditorZoneCategory) => void;
  onZoneNumberChange: (field: ZoneNumberField, value: number) => void;
  pointsToSvg: (points: CountLine["points"]) => string;
  roadIds: readonly string[];
  /** Every service point other than the one currently selected — for the
   * "next stop" dropdown (ADR-0021). Computed by the caller since it
   * depends on which service point is selected, unlike `roadIds`. */
  otherServicePointIds: readonly string[];
  selectedBuilding: Building | undefined;
  selectedConnector: Connector | undefined;
  selectedCountLine: CountLine | undefined;
  selectedCrosswalk: Crosswalk | undefined;
  selectedEntrance: Entrance | undefined;
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
  onConnectorCapacityChange,
  onConnectorCarCountChange,
  onConnectorDoorSecondsChange,
  onConnectorKindChange,
  onConnectorWidthChange,
  onToggleConnectorBidirectional,
  onCountLineNameChange,
  onCrosswalkNumberChange,
  onCrosswalkRoadIdChange,
  onEntranceKindChange,
  onEntrancePopulationChange,
  onEntranceProfileChange,
  onEntranceNumberChange,
  onHazardKindChange,
  onHazardNumberChange,
  onObstacleKindChange,
  onObstacleNumberChange,
  onRoadDirectionChange,
  onRoadNumberChange,
  onServiceNumberChange,
  onServiceNextIdChange,
  onServiceOutageWindowsChange,
  onShopNumberChange,
  onShopSizeChange,
  onToggleObstacleBlocksMovement,
  onToggleRoadTransitOnly,
  onToggleRoadVehicleAccessible,
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
  roadIds,
  otherServicePointIds,
  selectedBuilding,
  selectedConnector,
  selectedCountLine,
  selectedCrosswalk,
  selectedEntrance,
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
      {selectedConnector ? (
        <ConnectorParamGrid
          onCapacityChange={onConnectorCapacityChange}
          onCarCountChange={onConnectorCarCountChange}
          onDoorSecondsChange={onConnectorDoorSecondsChange}
          onKindChange={onConnectorKindChange}
          onToggleBidirectional={onToggleConnectorBidirectional}
          onWidthChange={onConnectorWidthChange}
          selectedConnector={selectedConnector}
          t={t}
        />
      ) : selectedShop ? (
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
          onToggleVehicleAccessible={onToggleRoadVehicleAccessible}
          onToggleWalkable={onToggleRoadWalkable}
          selectedRoad={selectedRoad}
          t={t}
        />
      ) : selectedCrosswalk ? (
        <CrosswalkParamGrid
          onNumberChange={onCrosswalkNumberChange}
          onRoadIdChange={onCrosswalkRoadIdChange}
          roadIds={roadIds}
          selectedCrosswalk={selectedCrosswalk}
          t={t}
        />
      ) : selectedBuilding ? (
        <BuildingParamGrid
          onKindChange={onBuildingKindChange}
          onNumberChange={onBuildingNumberChange}
          selectedBuilding={selectedBuilding}
          t={t}
        />
      ) : selectedEntrance ? (
        <EntranceParamGrid
          onKindChange={onEntranceKindChange}
          onPopulationChange={onEntrancePopulationChange}
          onProfileChange={onEntranceProfileChange}
          onNumberChange={onEntranceNumberChange}
          selectedEntrance={selectedEntrance}
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
          onNextServicePointIdChange={onServiceNextIdChange}
          onOutageWindowsChange={onServiceOutageWindowsChange}
          otherServicePointIds={otherServicePointIds}
          selectedServicePoint={selectedServicePoint}
          t={t}
        />
      ) : selectedCountLine ? (
        <div className="editor-param-grid">
          <label>{t("countLineName")}</label>
          <input
            type="text"
            data-testid="count-line-name"
            placeholder={t("countLine")}
            value={selectedCountLine.name ?? ""}
            onChange={(event) => onCountLineNameChange(event.target.value)}
          />
          <span>{t("countLineIdentifier")}</span>
          <span>{selectedCountLine.id}</span>
          <span>{t("countLineEndpoints")}</span>
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
