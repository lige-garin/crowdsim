import type { EditorDocument } from "./sceneEditorState";
import type { EditorZoneCategory } from "./sceneEditorState";

export type ShopNumberField = "attraction" | "capacity" | "dwellMeanSeconds";
export type ShopSizeField = "height" | "width";
export type ServiceNumberField = "capacityPerMinute" | "serviceMeanSeconds" | "width";
export type ZoneNumberField = "attraction" | "dwellMeanSeconds";

export function updateDocumentShopNumber(
  document: EditorDocument,
  shopId: string,
  field: ShopNumberField,
  value: number,
) {
  return {
    ...document,
    shops: document.shops.map((shop) =>
      shop.id === shopId
        ? { ...shop, [field]: Math.max(field === "attraction" ? 0 : 1, value) }
        : shop,
    ),
  };
}

export function updateDocumentShopSize(
  document: EditorDocument,
  shopId: string,
  field: ShopSizeField,
  value: number,
) {
  return {
    ...document,
    shops: document.shops.map((shop) =>
      shop.id === shopId
        ? {
            ...shop,
            size: { ...shop.size, [field]: Math.max(1, value) },
          }
        : shop,
    ),
  };
}

export function updateDocumentServiceNumber(
  document: EditorDocument,
  servicePointId: string,
  field: ServiceNumberField,
  value: number,
) {
  return {
    ...document,
    servicePoints: document.servicePoints.map((servicePoint) =>
      servicePoint.id === servicePointId
        ? {
            ...servicePoint,
            [field]: Math.max(field === "capacityPerMinute" ? 0 : 1, value),
          }
        : servicePoint,
    ),
  };
}

export function updateDocumentZoneCategory(
  document: EditorDocument,
  zoneId: string,
  category: EditorZoneCategory,
) {
  return {
    ...document,
    zones: document.zones.map((zone) =>
      zone.id === zoneId ? { ...zone, category } : zone,
    ),
  };
}

export function updateDocumentZoneNumber(
  document: EditorDocument,
  zoneId: string,
  field: ZoneNumberField,
  value: number,
) {
  return {
    ...document,
    zones: document.zones.map((zone) =>
      zone.id === zoneId
        ? { ...zone, [field]: Math.max(field === "attraction" ? 0 : 1, value) }
        : zone,
    ),
  };
}

export function toggleDocumentZoneWalkable(document: EditorDocument, zoneId: string) {
  return {
    ...document,
    zones: document.zones.map((zone) =>
      zone.id === zoneId ? { ...zone, walkable: !zone.walkable } : zone,
    ),
  };
}
