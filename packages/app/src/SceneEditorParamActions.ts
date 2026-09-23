import type { Dispatch, SetStateAction } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";

import {
  toggleBasemapBoolean,
  updateBasemapNumber,
  type BasemapNumberField,
  type EditorBasemap,
} from "./sceneEditorBasemap";
import {
  createSceneFromEditorDocument,
  type EditorDocument,
  type EditorZoneCategory,
} from "./sceneEditorState";
import {
  toggleDocumentObstacleBlocksMovement,
  toggleDocumentRoadBoolean,
  toggleDocumentTransitStopActive,
  toggleDocumentZoneWalkable,
  updateDocumentBuildingKind,
  updateDocumentBuildingNumber,
  toggleDocumentConnectorBidirectional,
  updateDocumentConnectorCapacity,
  updateDocumentConnectorCarCount,
  updateDocumentConnectorDoorSeconds,
  updateDocumentConnectorKind,
  updateDocumentConnectorWidth,
  updateDocumentCountLineName,
  updateDocumentCrosswalkNumber,
  updateDocumentCrosswalkRoadId,
  updateDocumentEntrancePopulation,
  updateDocumentHazardKind,
  updateDocumentHazardNumber,
  updateDocumentObstacleKind,
  updateDocumentObstacleNumber,
  updateDocumentRoadDirection,
  updateDocumentRoadNumber,
  updateDocumentServiceNumber,
  updateDocumentServicePointNextId,
  updateDocumentServicePointOutageWindows,
  updateDocumentShopNumber,
  updateDocumentShopSize,
  updateDocumentEntranceKind,
  updateDocumentEntranceProfile,
  updateDocumentEntranceNumber,
  updateDocumentTransitStopKind,
  updateDocumentTransitStopNumber,
  updateDocumentZoneCategory,
  updateDocumentZoneNumber,
  type BuildingNumberField,
  type HazardNumberField,
  type ObstacleNumberField,
  type RoadNumberField,
  type ServiceNumberField,
  type ShopNumberField,
  type ShopSizeField,
  type EntranceNumberField,
  type CrosswalkNumberField,
  type TransitStopNumberField,
  type ZoneNumberField,
} from "./sceneEditorMutations";
import type { LocalizedText } from "./i18n";
import { toggleEditorViewMode } from "./sceneEditorViewMode";
import { generateStoreLotsForZone } from "./storeLotGeneration";

type SceneEditorParamActionInput = {
  activeBasemap: EditorBasemap | null;
  currentScene: CrowdSimScene;
  document: EditorDocument;
  replaceScene: (nextScene: CrowdSimScene, status: LocalizedText) => void;
  selectedBuilding?: EditorDocument["buildings"][number];
  selectedConnector?: EditorDocument["connectors"][number];
  selectedCountLine?: EditorDocument["countLines"][number];
  selectedCrosswalk?: EditorDocument["crosswalks"][number];
  selectedHazard?: EditorDocument["hazards"][number];
  selectedObstacle?: EditorDocument["obstacles"][number];
  selectedRoad?: EditorDocument["roads"][number];
  selectedServicePoint?: EditorDocument["servicePoints"][number];
  selectedShop?: EditorDocument["shops"][number];
  selectedEntrance?: EditorDocument["entrances"][number];
  selectedTransitStop?: EditorDocument["transitStops"][number];
  selectedZone?: EditorDocument["zones"][number];
  setBaseScene: Dispatch<SetStateAction<CrowdSimScene>>;
  setDocument: Dispatch<SetStateAction<EditorDocument>>;
};

export function createSceneEditorParamActions(input: SceneEditorParamActionInput) {
  const {
    activeBasemap,
    currentScene,
    document,
    replaceScene,
    selectedBuilding,
    selectedConnector,
    selectedCountLine,
    selectedCrosswalk,
    selectedHazard,
    selectedObstacle,
    selectedRoad,
    selectedServicePoint,
    selectedShop,
    selectedEntrance,
    selectedTransitStop,
    selectedZone,
    setBaseScene,
    setDocument,
  } = input;

  return {
    generateStoresForSelectedZone() {
      if (!selectedZone) return;
      const generated = generateStoreLotsForZone(currentScene, selectedZone.id);
      const count = generated.summary.shopIds.length;
      replaceScene(generated.scene, {
        zh: `已生成 ${count} 个店铺`,
        en: `Generated ${count} stores`,
      });
    },
    toggleBasemap(field: "locked" | "visible") {
      if (!activeBasemap) return;
      setBaseScene((current) => toggleBasemapBoolean(current, activeBasemap.id, field));
    },
    updateBuildingKind(kind: EditorDocument["buildings"][number]["kind"]) {
      if (!selectedBuilding) return;
      setDocument((current) =>
        updateDocumentBuildingKind(current, selectedBuilding.id, kind),
      );
    },
    updateConnectorKind(kind: EditorDocument["connectors"][number]["kind"]) {
      if (!selectedConnector) return;
      setDocument((current) =>
        updateDocumentConnectorKind(current, selectedConnector.id, kind),
      );
    },
    updateConnectorWidth(width: number) {
      if (!selectedConnector) return;
      setDocument((current) =>
        updateDocumentConnectorWidth(current, selectedConnector.id, width),
      );
    },
    updateConnectorCapacity(capacity: number) {
      if (!selectedConnector) return;
      setDocument((current) =>
        updateDocumentConnectorCapacity(current, selectedConnector.id, capacity),
      );
    },
    updateConnectorCarCount(carCount: number) {
      if (!selectedConnector) return;
      setDocument((current) =>
        updateDocumentConnectorCarCount(current, selectedConnector.id, carCount),
      );
    },
    updateConnectorDoorSeconds(doorSeconds: number) {
      if (!selectedConnector) return;
      setDocument((current) =>
        updateDocumentConnectorDoorSeconds(current, selectedConnector.id, doorSeconds),
      );
    },
    toggleConnectorBidirectional() {
      if (!selectedConnector) return;
      setDocument((current) =>
        toggleDocumentConnectorBidirectional(current, selectedConnector.id),
      );
    },
    updateEntrancePopulation(populationId: string) {
      if (!selectedEntrance) return;
      setDocument((current) =>
        updateDocumentEntrancePopulation(current, selectedEntrance.id, populationId),
      );
    },
    updateCountLineName(name: string) {
      if (!selectedCountLine) return;
      setDocument((current) =>
        updateDocumentCountLineName(current, selectedCountLine.id, name),
      );
    },
    updateCrosswalkNumber(field: CrosswalkNumberField, value: number) {
      if (!selectedCrosswalk || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentCrosswalkNumber(current, selectedCrosswalk.id, field, value),
      );
    },
    updateCrosswalkRoadId(roadId: string) {
      if (!selectedCrosswalk) return;
      setDocument((current) =>
        updateDocumentCrosswalkRoadId(current, selectedCrosswalk.id, roadId),
      );
    },
    toggleObstacleBlocksMovement() {
      if (!selectedObstacle) return;
      setDocument((current) =>
        toggleDocumentObstacleBlocksMovement(current, selectedObstacle.id),
      );
    },
    toggleRoadBoolean(field: "transitOnly" | "vehicleAccessible" | "walkable") {
      if (!selectedRoad) return;
      setDocument((current) =>
        toggleDocumentRoadBoolean(current, selectedRoad.id, field),
      );
    },
    toggleTransitStopActive() {
      if (!selectedTransitStop) return;
      setDocument((current) =>
        toggleDocumentTransitStopActive(current, selectedTransitStop.id),
      );
    },
    toggleViewMode() {
      setBaseScene((current) =>
        toggleEditorViewMode(createSceneFromEditorDocument(current, document)),
      );
    },
    toggleZoneWalkable() {
      if (!selectedZone) return;
      setDocument((current) => toggleDocumentZoneWalkable(current, selectedZone.id));
    },
    updateBasemap(field: BasemapNumberField, value: number) {
      if (!activeBasemap || !Number.isFinite(value)) return;
      setBaseScene((current) =>
        updateBasemapNumber(current, activeBasemap.id, field, value),
      );
    },
    updateBuildingNumber(field: BuildingNumberField, value: number) {
      if (!selectedBuilding || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentBuildingNumber(current, selectedBuilding.id, field, value),
      );
    },
    updateHazardKind(kind: EditorDocument["hazards"][number]["kind"]) {
      if (!selectedHazard) return;
      setDocument((current) =>
        updateDocumentHazardKind(current, selectedHazard.id, kind),
      );
    },
    updateHazardNumber(field: HazardNumberField, value: number) {
      if (!selectedHazard || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentHazardNumber(current, selectedHazard.id, field, value),
      );
    },
    updateObstacleKind(kind: EditorDocument["obstacles"][number]["kind"]) {
      if (!selectedObstacle) return;
      setDocument((current) =>
        updateDocumentObstacleKind(current, selectedObstacle.id, kind),
      );
    },
    updateObstacleNumber(field: ObstacleNumberField, value: number) {
      if (!selectedObstacle || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentObstacleNumber(current, selectedObstacle.id, field, value),
      );
    },
    updateRoadDirection(direction: EditorDocument["roads"][number]["direction"]) {
      if (!selectedRoad) return;
      setDocument((current) =>
        updateDocumentRoadDirection(current, selectedRoad.id, direction),
      );
    },
    updateRoadNumber(field: RoadNumberField, value: number) {
      if (!selectedRoad || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentRoadNumber(current, selectedRoad.id, field, value),
      );
    },
    updateServiceNumber(field: ServiceNumberField, value: number) {
      if (!selectedServicePoint || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentServiceNumber(current, selectedServicePoint.id, field, value),
      );
    },
    updateServiceNextId(nextServicePointId: string | undefined) {
      if (!selectedServicePoint) return;
      setDocument((current) =>
        updateDocumentServicePointNextId(
          current,
          selectedServicePoint.id,
          nextServicePointId,
        ),
      );
    },
    updateServiceOutageWindows(text: string) {
      if (!selectedServicePoint) return;
      setDocument((current) =>
        updateDocumentServicePointOutageWindows(current, selectedServicePoint.id, text),
      );
    },
    updateShopNumber(field: ShopNumberField, value: number) {
      if (!selectedShop || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentShopNumber(current, selectedShop.id, field, value),
      );
    },
    updateShopSize(field: ShopSizeField, value: number) {
      if (!selectedShop || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentShopSize(current, selectedShop.id, field, value),
      );
    },
    updateEntranceKind(kind: EditorDocument["entrances"][number]["kind"]) {
      if (!selectedEntrance) return;
      setDocument((current) =>
        updateDocumentEntranceKind(current, selectedEntrance.id, kind),
      );
    },
    updateEntranceProfile(text: string) {
      if (!selectedEntrance) return;
      setDocument((current) =>
        updateDocumentEntranceProfile(current, selectedEntrance.id, text),
      );
    },
    updateEntranceNumber(field: EntranceNumberField, value: number) {
      if (!selectedEntrance || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentEntranceNumber(current, selectedEntrance.id, field, value),
      );
    },
    updateTransitStopKind(kind: EditorDocument["transitStops"][number]["kind"]) {
      if (!selectedTransitStop) return;
      setDocument((current) =>
        updateDocumentTransitStopKind(current, selectedTransitStop.id, kind),
      );
    },
    updateTransitStopNumber(field: TransitStopNumberField, value: number) {
      if (!selectedTransitStop || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentTransitStopNumber(current, selectedTransitStop.id, field, value),
      );
    },
    updateZoneCategory(category: EditorZoneCategory) {
      if (!selectedZone) return;
      setDocument((current) =>
        updateDocumentZoneCategory(current, selectedZone.id, category),
      );
    },
    updateZoneNumber(field: ZoneNumberField, value: number) {
      if (!selectedZone || !Number.isFinite(value)) return;
      setDocument((current) =>
        updateDocumentZoneNumber(current, selectedZone.id, field, value),
      );
    },
  };
}
