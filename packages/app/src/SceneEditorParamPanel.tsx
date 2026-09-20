import type { TranslationKey } from "./i18n";
import type { BasemapNumberField, EditorBasemap } from "./sceneEditorBasemap";
import type { EditorDocument, EditorZoneCategory } from "./sceneEditorState";
import type {
  BuildingNumberField,
  EntranceNumberField,
  HazardNumberField,
  ObstacleNumberField,
  RoadNumberField,
  TransitStopNumberField,
  ZoneNumberField,
} from "./sceneEditorMutations";
import {
  BuildingParamGrid,
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
type Obstacle = EditorDocument["obstacles"][number];
type Hazard = EditorDocument["hazards"][number];
type Shop = EditorDocument["shops"][number];
type ServicePoint = EditorDocument["servicePoints"][number];
type CountLine = EditorDocument["countLines"][number];
type Zone = EditorDocument["zones"][number];
type Entrance = EditorDocument["entrances"][number];

type SceneEditorParamPanelProps = {
  basemap: EditorBasemap | null;
  onBasemapNumberChange: (field: BasemapNumberField, value: number) => void;
  onBuildingKindChange: (kind: Building["kind"]) => void;
  onEntranceKindChange: (kind: Entrance["kind"]) => void;
  onEntranceProfileChange: (text: string) => void;
  onEntranceNumberChange: (field: EntranceNumberField, value: number) => void;
  onBuildingNumberChange: (field: BuildingNumberField, value: number) => void;
  onCountLineNameChange: (name: string) => void;
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
  onCountLineNameChange,
  onEntranceKindChange,
  onEntranceProfileChange,
  onEntranceNumberChange,
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
      ) : selectedEntrance ? (
        <EntranceParamGrid
          onKindChange={onEntranceKindChange}
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
