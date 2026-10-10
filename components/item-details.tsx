"use client";
import { ShoeSizeFields } from "@/components/shoe-size-fields";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Item } from "@/lib/domain";
import { CATEGORY_MEASUREMENTS, FITS, SHOE_FITS, garmentCategory, measurementName } from "@/lib/item-details";
import { useI18n } from "@/lib/i18n/provider";
export function ItemDetailsFields({ item, onChange }: {
    item: Item;
    onChange: (item: Item) => void;
}) {
    const { t } = useI18n();
    const id = useId();
    const measurements = CATEGORY_MEASUREMENTS[item.category] || [];
    return <div className="item-details-fields">
    {garmentCategory(item.category) && <div className="field"><Label>{t("版型")}</Label><div className="chip-row">{[["", t("未填写")], ...Object.entries(FITS)].map(([value, name]) => <button type="button" key={value} className={`chip ${(item.fit || "") === value ? "selected" : ""}`} aria-pressed={(item.fit || "") === value} onClick={() => onChange({ ...item, fit: (value || null) as Item["fit"] })}>{t(name)}</button>)}</div></div>}
    {item.category === "shoes" && <>
      <div className="field"><Label>{t("合脚程度")}</Label><div className="chip-row">{[["", t("未填写")], ...Object.entries(SHOE_FITS)].map(([value, name]) => <button type="button" key={value} className={`chip ${(item.shoeFit || "") === value ? "selected" : ""}`} aria-pressed={(item.shoeFit || "") === value} onClick={() => onChange({ ...item, shoeFit: (value || null) as Item["shoeFit"] })}>{t(name)}</button>)}</div></div>
      <ShoeSizeFields value={item.shoeSize} onChange={shoeSize => onChange({ ...item, shoeSize })}/>
      <p className="field-hint">{t("按鞋标分别填写欧码和中国码，不自动换算；任意一项可留空。")}</p>
    </>}
    {!!measurements.length && <section className="measurement-fields"><h3>{t("衣物实测尺寸（cm）")}</h3><p className="field-hint">{t("填写衣物尺寸；胸围、腰围等围度填写一整圈，不是平铺的半围。不确定的尺寸可留空。")}</p><div className="measurement-grid">{measurements.map(key => <div className="field" key={key}><Label htmlFor={`${id}-${key}`}>{t(measurementName(item.category, key))}</Label><Input id={`${id}-${key}`} type="number" min={0.1} max={500} step="any" inputMode="decimal" placeholder={t("未填写")} value={item.measurements[key] ?? ""} onChange={event => {
                    const values = { ...item.measurements };
                    if (event.target.value === "")
                        delete values[key];
                    else
                        values[key] = Number(event.target.value);
                    onChange({ ...item, measurements: values });
                }}/></div>)}</div></section>}
  </div>;
}
export function ItemLabels({ item, showMeasurements = true }: {
    item: Item;
    showMeasurements?: boolean;
}) {
    const { t, locale } = useI18n();
    const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
    const tags: string[] = [];
    if (garmentCategory(item.category) && item.fit)
        tags.push(t(FITS[item.fit]));
    if (item.category === "shoes") {
        if (item.shoeFit)
            tags.push(t(SHOE_FITS[item.shoeFit]));
        if (item.shoeSize.eu !== null)
            tags.push(t("欧码 {size}", { size: number(item.shoeSize.eu) }));
        if (item.shoeSize.cn !== null)
            tags.push(t("中国码 {size} mm", { size: number(item.shoeSize.cn) }));
    }
    for (const key of showMeasurements ? CATEGORY_MEASUREMENTS[item.category] || [] : []) {
        const value = item.measurements[key];
        if (value !== undefined)
            tags.push(t("{label} {value} cm", { label: t(measurementName(item.category, key)), value: number(value) }));
    }
    return tags.length ? <div className="item-attribute-tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div> : null;
}
