import { useMemo, useState } from "react";
import type { CrowdSimScene } from "@crowdsim/scene-schema";
import {
  applyShopLayoutToLot,
  applyShopLayoutToShop,
  planShopLayout,
  priceTierForAverageTicket,
  sizeForArea,
  type DoorEdge,
  type ShopLayout,
  type ShopLayoutSpec,
  type TableCounts,
} from "../scenes/shopLayout";
import { useI18n } from "../i18n";

/**
 * The shop form: a name, an area, an average spend and a table mix, laid out
 * into whatever rectangle the shop actually has.
 *
 * Two targets, because a scene gets its shops two ways:
 *
 * - a **store lot** (a mall, from `createMallSkeleton` or the editor's zone
 *   generator), whose rectangle is its own geometry — the area is read off it
 *   and is not editable here;
 * - a **standalone shop** (a street site, from a site bundle), whose rectangle
 *   is all there is, so the area is an input and changing it changes the shop.
 *
 * The plan is shown before anything is applied, and "these tables do not fit"
 * is shown as what it is — the one answer here that is arithmetic rather than
 * inference, and a real result rather than an error.
 */

const tableKinds = ["twoSeat", "fourSeat", "sixSeat", "privateRoom10"] as const;

type TableKind = (typeof tableKinds)[number];

const tableLabels: Record<TableKind, { zh: string; en: string }> = {
  twoSeat: { zh: "2 人桌", en: "2-seat" },
  fourSeat: { zh: "4 人桌", en: "4-seat" },
  sixSeat: { zh: "6 人桌", en: "6-seat" },
  privateRoom10: { zh: "10 人包房", en: "10-seat room" },
};

const edges: { id: DoorEdge; zh: string; en: string }[] = [
  { id: "south", zh: "南", en: "south" },
  { id: "north", zh: "北", en: "north" },
  { id: "west", zh: "西", en: "west" },
  { id: "east", zh: "东", en: "east" },
];

type Preview = { kind: "ok"; layout: ShopLayout } | { kind: "error"; error: string };

type FormFields = {
  areaSquareMeters: number;
  averageTicketYuan: number;
  doorEdge: DoorEdge;
  dwellMeanSeconds: number;
  name: string;
  tables: TableCounts;
};

export function ShopLayoutPanel({
  scene,
  onApplyScene,
}: {
  scene: CrowdSimScene;
  onApplyScene?: (scene: CrowdSimScene) => void;
}) {
  const { language } = useI18n();
  const zh = language === "zh";
  const shops = scene.shops;
  const [shopId, setShopId] = useState(() => shops[0]?.id ?? "");
  const shop = shops.find((candidate) => candidate.id === shopId) ?? shops[0];
  const lot = shop?.storeLotId
    ? scene.storeLots.find((candidate) => candidate.id === shop.storeLotId)
    : undefined;
  const [fields, setFields] = useState<FormFields>(() =>
    shop ? fieldsFor(scene, shop) : emptyFields(),
  );
  const [applied, setApplied] = useState(false);

  /*
   * The rectangle the plan is laid out in. Both apply functions re-derive it
   * from the geometry they are given — the lot's own points, or the shop's own
   * size — so this copy exists so the preview and the applied layout agree,
   * which is the whole point of showing a preview.
   */
  const spec: ShopLayoutSpec = useMemo(
    () => ({
      doorEdge: fields.doorEdge,
      tables: fields.tables,
      lot: rectFor(scene, shop?.id ?? "", fields),
    }),
    [fields, scene, shop],
  );

  const preview = useMemo<Preview>(() => {
    try {
      return { kind: "ok", layout: planShopLayout(spec) };
    } catch (error) {
      return {
        kind: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [spec]);

  if (!shop) {
    return (
      <section className="probe-panel" aria-label={zh ? "店铺布局" : "Shop layout"}>
        <h3>{zh ? "店铺布局" : "Shop layout"}</h3>
        <p data-testid="shop-layout-empty">
          {zh
            ? "当前场景里没有店铺。先用商场骨架生成器生成一个商场，或在编辑器里放一个店铺。"
            : "This scene has no shop. Generate a mall first, or place a shop in the editor."}
        </p>
      </section>
    );
  }

  const title = zh ? "店铺布局" : "Shop layout";

  const pickShop = (nextId: string) => {
    const next = shops.find((candidate) => candidate.id === nextId);

    setShopId(nextId);
    setApplied(false);
    if (next) setFields(fieldsFor(scene, next));
  };

  const apply = () => {
    if (!onApplyScene) return;

    onApplyScene(
      lot
        ? applyShopLayoutToLot(scene, lot.id, spec, {
            averageTicketYuan: fields.averageTicketYuan,
            dwellMeanSeconds: fields.dwellMeanSeconds,
            name: fields.name,
          })
        : applyShopLayoutToShop(scene, shop.id, spec, {
            averageTicketYuan: fields.averageTicketYuan,
            dwellMeanSeconds: fields.dwellMeanSeconds,
            name: fields.name,
            size: sizeForArea(fields.areaSquareMeters),
          }),
    );
    setApplied(true);
  };

  return (
    <section className="probe-panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {zh
          ? "桌型配比算出来的座位数和占地是算术；家具尺寸和通道宽度是自拟值，只能用来比较两个方案，不能当成预测。"
          : "Seats and floor area from the table mix are arithmetic. Furniture sizes and aisle widths are self-chosen: good for comparing two layouts, not for predicting anything."}
      </p>
      <label>
        {zh ? "店铺" : "Shop"}
        <select
          data-testid="shop-layout-target"
          value={shop.id}
          onChange={(event) => pickShop(event.target.value)}
        >
          {shops.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name ?? candidate.id}
              {candidate.storeLotId ? (zh ? "（铺位）" : " (lot)") : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        {zh ? "名称" : "Name"}
        <input
          type="text"
          data-testid="shop-layout-name"
          value={fields.name}
          onChange={(event) => setFields({ ...fields, name: event.target.value })}
        />
      </label>
      <label>
        {zh ? "面积（㎡）" : "Area (sq m)"}
        <input
          type="number"
          data-testid="shop-layout-area"
          disabled={Boolean(lot)}
          value={Math.round(fields.areaSquareMeters)}
          onChange={(event) =>
            setFields({ ...fields, areaSquareMeters: Number(event.target.value) })
          }
        />
      </label>
      {lot ? (
        <p data-testid="shop-layout-area-locked">
          {zh
            ? "面积由铺位几何决定，改不了；要改面积就在编辑器里改铺位。"
            : "The area comes from the lot's geometry and is not editable here — change the lot in the editor."}
        </p>
      ) : null}
      <label>
        {zh ? "客单价（元）" : "Average spend"}
        <input
          type="number"
          data-testid="shop-layout-ticket"
          value={fields.averageTicketYuan}
          onChange={(event) =>
            setFields({ ...fields, averageTicketYuan: Number(event.target.value) })
          }
        />
      </label>
      <label>
        {zh ? "平均停留（秒）" : "Dwell (s)"}
        <input
          type="number"
          data-testid="shop-layout-dwell"
          value={fields.dwellMeanSeconds}
          onChange={(event) =>
            setFields({ ...fields, dwellMeanSeconds: Number(event.target.value) })
          }
        />
      </label>
      <label>
        {zh ? "门在哪一边" : "Door side"}
        <select
          data-testid="shop-layout-door"
          value={fields.doorEdge}
          onChange={(event) =>
            setFields({ ...fields, doorEdge: event.target.value as DoorEdge })
          }
        >
          {edges.map((edge) => (
            <option key={edge.id} value={edge.id}>
              {zh ? edge.zh : edge.en}
            </option>
          ))}
        </select>
      </label>
      {tableKinds.map((kind) => (
        <label key={kind}>
          {zh ? tableLabels[kind].zh : tableLabels[kind].en}
          <input
            type="number"
            data-testid={`shop-layout-table-${kind}`}
            value={fields.tables[kind] ?? 0}
            onChange={(event) =>
              setFields({
                ...fields,
                tables: { ...fields.tables, [kind]: Number(event.target.value) },
              })
            }
          />
        </label>
      ))}
      {preview?.kind === "ok" ? (
        <p data-testid="shop-layout-preview">
          {zh ? "座位" : "seats"} {preview.layout.capacity}
          {" · "}
          {zh ? "桌面占地" : "table area"}{" "}
          {preview.layout.tableAreaSquareMeters.toFixed(1)} {zh ? "㎡" : "sq m"}
          {" / "}
          {zh ? "铺位" : "lot"} {preview.layout.lotAreaSquareMeters.toFixed(1)}{" "}
          {zh ? "㎡" : "sq m"}
          {" · "}
          {zh ? "价位档" : "price tier"}{" "}
          {priceTierForAverageTicket(fields.averageTicketYuan)}
        </p>
      ) : null}
      {preview?.kind === "error" ? (
        <code data-testid="shop-layout-error">{preview.error}</code>
      ) : null}
      {onApplyScene ? (
        <button
          type="button"
          data-testid="shop-layout-apply"
          disabled={preview?.kind === "error"}
          onClick={apply}
        >
          {zh ? "应用到场景" : "Apply to scene"}
        </button>
      ) : null}
      {applied ? (
        <code data-testid="shop-layout-applied">{zh ? "已应用" : "applied"}</code>
      ) : null}
    </section>
  );
}

function fieldsFor(
  scene: CrowdSimScene,
  shop: CrowdSimScene["shops"][number],
): FormFields {
  const stored = (shop.customParameters ?? {}) as Record<string, unknown>;
  const lot = shop.storeLotId
    ? scene.storeLots.find((candidate) => candidate.id === shop.storeLotId)
    : undefined;
  const bounds = lot ? boundsOf(lot.geometry.points) : null;
  const area = bounds
    ? bounds.width * bounds.height
    : shop.size.width * shop.size.height;

  return {
    areaSquareMeters: area,
    averageTicketYuan:
      typeof stored.averageTicketYuan === "number" ? stored.averageTicketYuan : 0,
    doorEdge: (stored.doorEdge as DoorEdge | undefined) ?? "south",
    dwellMeanSeconds: shop.dwellMeanSeconds,
    name: shop.name ?? shop.id,
    tables: (stored.tables as TableCounts | undefined) ?? {},
  };
}

function emptyFields(): FormFields {
  return {
    areaSquareMeters: 100,
    averageTicketYuan: 0,
    doorEdge: "south",
    dwellMeanSeconds: 240,
    name: "",
    tables: {},
  };
}

/**
 * The rectangle to lay out in: the lot's bounding box when the shop sits on
 * one, the shop's own size otherwise. A form that asks for a different area
 * gets that area, at 2:3, centred where the shop already is.
 */
function rectFor(scene: CrowdSimScene, shopId: string, fields: FormFields) {
  const shop = scene.shops.find((candidate) => candidate.id === shopId);

  if (!shop) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const lot = shop.storeLotId
    ? scene.storeLots.find((candidate) => candidate.id === shop.storeLotId)
    : undefined;

  if (lot) {
    return boundsOf(lot.geometry.points);
  }

  const size = sizeForArea(fields.areaSquareMeters);

  return {
    x: shop.position.x - size.width / 2,
    y: shop.position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function boundsOf(points: readonly { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
}
