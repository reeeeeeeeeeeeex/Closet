import type { ReactNode } from "react";
import { ColorDetails } from "@/components/color-field";
import { useI18n } from "@/lib/i18n/provider";
import { itemColorStyle } from "@/lib/colors";
import { CATEGORIES, OCCASIONS, SEASONS, type Item } from "@/lib/domain";
import { CATEGORY_MEASUREMENTS, FITS, SHOE_FITS, measurementName } from "@/lib/item-details";

export function ItemPhotoDetails({ item }: { item: Item }) {
  const { t, locale } = useI18n();
  const colors = itemColorStyle(item);
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const separator = t("、");
  const fields: { label: string; value: ReactNode; wide?: boolean }[] = [];
  function add(label: string, value?: string | number | null, unit?: "cm" | "mm") {
    if (value == null || (typeof value === "string" && !value.trim())) return;
    const text = typeof value === "number" ? numberFormat.format(value) : value;
    const hasDefaultUnit = unit && (typeof value === "number" || /^\d+(?:[.,]\d+)?$/.test(value.trim()));
    fields.push({ label, value: hasDefaultUnit ? `${text} ${unit}` : text });
  }
  add(t("品牌"), item.brand);
  if (colors.values.length) fields.push({ label: t("颜色"), value: <ColorDetails style={colors}/>, wide: true });
  add(t("分类"), t(CATEGORIES[item.category]));
  add(t("面料材质"), item.fabric);
  add(t("购买价格"), item.purchasePrice);
  add(t("季节"), item.seasons.map(season => t(SEASONS[season])).join(separator));
  add(t("适合场合"), item.occasions.map(occasion => t(OCCASIONS[occasion])).join(separator));
  if (item.fit) add(t("版型"), t(FITS[item.fit]));
  if (item.category === "shoes") {
    if (item.shoeFit) add(t("合脚程度"), t(SHOE_FITS[item.shoeFit]));
    add(t("欧码（EU）"), item.shoeSize.eu);
    add(t("中国码"), item.shoeSize.cn, "mm");
  }
  for (const key of CATEGORY_MEASUREMENTS[item.category] ?? []) {
    add(t(measurementName(item.category, key)), item.measurements[key], "cm");
  }
  if (item.notes.trim()) fields.push({ label: t("穿着备注"), value: item.notes, wide: true });
  return <dl className="item-photo-details">
    {fields.map(({ label, value, wide }) => <div key={label} className={wide ? "item-photo-details-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>)}
  </dl>;
}
