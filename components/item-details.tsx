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
      <p className="field-hint">{t("鞋码可自由填写，如“38/39”或“约240”。两种尺码不自动换算，可留空。")}</p>
    </>}
    {!!measurements.length && <section className="measurement-fields"><h3>{t("衣物实测尺寸（cm）")}</h3><p className="field-hint">{t("尺寸可自由填写，如“约70”或“68–72”。默认单位为 cm，也可注明其他单位；围度填写一整圈，可留空。")}</p><div className="measurement-grid">{measurements.map(key => <div className="field" key={key}><Label htmlFor={`${id}-${key}`}>{t(measurementName(item.category, key))}</Label><Input id={`${id}-${key}`} type="text" maxLength={100} placeholder={t("未填写")} value={item.measurements[key] ?? ""} onChange={event => {
                    const values = { ...item.measurements };
                    if (event.target.value === "")
                        delete values[key];
                    else
                        values[key] = event.target.value;
                    onChange({ ...item, measurements: values });
                }}/></div>)}</div></section>}
  </div>;
}
export function ItemLabels({ item, showMeasurements = true }: {
    item: Item;
    showMeasurements?: boolean;
}) {
    const { t, locale } = useI18n();
    const display = (value: number | string) => typeof value === "number" ? new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value) : value;
    const numeric = (value: number | string) => typeof value === "number" || /^\d+(?:[.,]\d+)?$/.test(value);
    const tags: string[] = [];
    if (garmentCategory(item.category) && item.fit)
        tags.push(t(FITS[item.fit]));
    if (item.category === "shoes") {
        if (item.shoeFit)
            tags.push(t(SHOE_FITS[item.shoeFit]));
        if (item.shoeSize.eu !== null && item.shoeSize.eu !== "")
            tags.push(t("欧码 {size}", { size: display(item.shoeSize.eu) }));
        if (item.shoeSize.cn !== null && item.shoeSize.cn !== "") {
            const params = { size: display(item.shoeSize.cn) };
            tags.push(numeric(item.shoeSize.cn) ? t("中国码 {size} mm", params) : t("中国码 {size}", params));
        }
    }
    for (const key of showMeasurements ? CATEGORY_MEASUREMENTS[item.category] || [] : []) {
        const value = item.measurements[key];
        if (value !== undefined && value !== "") {
            const params = { label: t(measurementName(item.category, key)), value: display(value) };
            tags.push(numeric(value) ? t("{label} {value} cm", params) : t("{label} {value}", params));
        }
    }
    return tags.length ? <div className="item-attribute-tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div> : null;
}
