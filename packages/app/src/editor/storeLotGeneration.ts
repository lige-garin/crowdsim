import {
  parseScene,
  type CrowdSimScene,
  type ScenePoint,
} from "@crowdsim/scene-schema";

type Zone = CrowdSimScene["zones"][number];
type BrandCategory = CrowdSimScene["brandProfiles"][number]["category"];

export type StoreLotGenerationSummary = {
  brandProfileIds: string[];
  shopIds: string[];
  storeLotIds: string[];
  zoneId: string;
};

export function generateStoreLotsForZone(
  scene: CrowdSimScene,
  zoneId: string,
): { scene: CrowdSimScene; summary: StoreLotGenerationSummary } {
  const zone = scene.zones.find((candidate) => candidate.id === zoneId);

  if (!zone) {
    throw new Error(`Unknown zone: ${zoneId}`);
  }

  const bounds = boundsForPoints(zone.geometry.points);
  const lotCount = Math.max(1, Math.min(8, Math.floor(bounds.width / 8) || 1));
  const lotWidth = bounds.width / lotCount;
  const category = brandCategoryForZone(zone);
  const created = Array.from({ length: lotCount }, (_, index) =>
    createStoreFromZone(scene, zone, category, bounds, lotWidth, index),
  );

  return {
    scene: parseScene({
      ...scene,
      brandProfiles: [
        ...scene.brandProfiles,
        ...created.map((item) => item.brandProfile),
      ],
      shops: [...scene.shops, ...created.map((item) => item.shop)],
      storeLots: [...scene.storeLots, ...created.map((item) => item.storeLot)],
    }),
    summary: {
      brandProfileIds: created.map((item) => item.brandProfile.id),
      shopIds: created.map((item) => item.shop.id),
      storeLotIds: created.map((item) => item.storeLot.id),
      zoneId,
    },
  };
}

function createStoreFromZone(
  scene: CrowdSimScene,
  zone: Zone,
  category: BrandCategory,
  bounds: ReturnType<typeof boundsForPoints>,
  lotWidth: number,
  index: number,
) {
  const ids = new Set([
    ...scene.brandProfiles.map((brand) => brand.id),
    ...scene.shops.map((shop) => shop.id),
    ...scene.storeLots.map((lot) => lot.id),
  ]);
  const suffix = nextSuffix(ids, `${zone.id}-${index + 1}`);
  const x1 = bounds.minX + lotWidth * index;
  const x2 =
    index === Math.floor(bounds.width / lotWidth) - 1 ? bounds.maxX : x1 + lotWidth;
  const y1 = bounds.minY;
  const y2 = bounds.maxY;
  const center = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const entrancePosition = { x: center.x, y: y2 };
  const brandProfile = {
    id: `brand-${suffix}`,
    name: generatedBrandName(zone, index),
    brandPower: Math.min(0.95, 0.45 + zone.attraction * 0.45 + index * 0.02),
    category,
    novelty: category === "jewelry" || category === "cosmetics" ? 0.5 : 0.32,
    personaAffinity: personaAffinityForCategory(category),
    priceTier: priceTierForCategory(category),
    promotion: 0,
    visibility: Math.min(0.95, 0.48 + zone.attraction * 0.35),
  };
  const shop = {
    id: `shop-${suffix}`,
    attraction: Math.max(0.2, zone.attraction),
    brand: { ...brandProfile, profileId: brandProfile.id },
    capacity: Math.max(4, Math.round((lotWidth * bounds.height) / 6)),
    dwellMeanSeconds: dwellForCategory(category, zone.dwellMeanSeconds),
    entrancePosition,
    name: brandProfile.name,
    position: center,
    queueAnchor: { x: center.x, y: y2 + 2 },
    size: { height: Math.max(2, bounds.height), width: Math.max(2, lotWidth) },
    storeLotId: `lot-${suffix}`,
    zoneId: zone.id,
  };
  const storeLot = {
    id: `lot-${suffix}`,
    generated: true,
    geometry: {
      type: "polygon" as const,
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
      ],
    },
    entrancePosition,
    queueAnchor: shop.queueAnchor,
    shopId: shop.id,
    zoneId: zone.id,
  };

  return { brandProfile, shop, storeLot };
}

function boundsForPoints(points: readonly ScenePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    height: Math.max(1, maxY - minY),
    maxX,
    maxY,
    minX,
    minY,
    width: Math.max(1, maxX - minX),
  };
}

function brandCategoryForZone(zone: Zone): BrandCategory {
  const map: Partial<Record<Zone["category"], BrandCategory>> = {
    anchor: "anchor",
    cosmetics: "cosmetics",
    dining: "dining",
    electronics: "electronics",
    entertainment: "entertainment",
    fashion: "fastFashion",
    grocery: "grocery",
    jewelry: "jewelry",
    service: "service",
  };

  return map[zone.category] ?? "service";
}

function generatedBrandName(zone: Zone, index: number) {
  const base = zone.name ?? `${zone.category} zone`;

  return `${titleCase(base)} ${index + 1}`;
}

function personaAffinityForCategory(category: BrandCategory) {
  if (category === "jewelry" || category === "luxury") {
    return { goalBuyer: 0.62, luxuryBuyer: 0.9 };
  }

  if (category === "cosmetics" || category === "fastFashion") {
    return { browser: 0.8, goalBuyer: 0.58, luxuryBuyer: 0.52 };
  }

  if (category === "dining" || category === "restaurant") {
    return { browser: 0.45, family: 0.78 };
  }

  return { browser: 0.48, commuter: 0.42, serviceSeeker: 0.54 };
}

function priceTierForCategory(category: BrandCategory) {
  if (category === "jewelry" || category === "luxury") {
    return 5;
  }

  if (category === "cosmetics" || category === "electronics") {
    return 4;
  }

  return 3;
}

function dwellForCategory(category: BrandCategory, zoneDwellSeconds: number) {
  const multiplier =
    category === "dining" || category === "restaurant"
      ? 1.5
      : category === "jewelry" || category === "cosmetics"
        ? 1.2
        : 1;

  return Math.round(Math.max(60, zoneDwellSeconds * multiplier));
}

function nextSuffix(existingIds: Set<string>, preferred: string) {
  let suffix = preferred;
  let index = 1;

  while (
    existingIds.has(`brand-${suffix}`) ||
    existingIds.has(`shop-${suffix}`) ||
    existingIds.has(`lot-${suffix}`)
  ) {
    index++;
    suffix = `${preferred}-${index}`;
  }

  return suffix;
}

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
