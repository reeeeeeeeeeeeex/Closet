"use client";
import { translatedOptions } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoEditor } from "@/components/photo-gallery";
import type { PhotoDraft } from "@/lib/photo-draft";
import { ItemCard } from "@/components/closet-cards";
import { CATEGORIES, OCCASIONS, type ItemRecord, type Outfit } from "@/lib/domain";
export function OutfitFields({ data, onChange, photos, onPhotos, items, onError, compact = false }: {
    compact?: boolean;
    data: Outfit;
    onChange: (data: Outfit) => void;
    photos: PhotoDraft;
    onPhotos: (photos: PhotoDraft) => void;
    items: ItemRecord[];
    onError: (message: string) => void;
}) {
    const { t } = useI18n();
    const id = useId();
    const [filter, setFilter] = useState("all");
    const selectable = items.filter(item => !item.data.archived || data.itemIds.includes(item.id));
    const available = selectable.filter(item => filter === "all" || item.data.category === filter);
    return <div className="outfit-draft">
    <PhotoEditor compact={compact} draft={photos} onChange={onPhotos} kind="outfit" onError={onError}/>
    <div className="form-fields">
      <div className="field"><Label htmlFor={`${id}-name`}>{t("搭配名称")}</Label><Input id={`${id}-name`} required maxLength={100} value={data.name} onChange={event => onChange({ ...data, name: event.target.value })} placeholder={t("例如：轻松的周五")}/></div>
      <div className="field"><Label>{t("适合场合")}</Label><div className="chip-row">{Object.entries(OCCASIONS).map(([value, name]) => <button type="button" key={value} className={`chip ${data.occasions.includes(value as Outfit["occasions"][number]) ? "selected" : ""}`} aria-pressed={data.occasions.includes(value as Outfit["occasions"][number])} onClick={() => { const occasion = value as Outfit["occasions"][number]; onChange({ ...data, occasions: data.occasions.includes(occasion) ? data.occasions.filter(o => o !== occasion) : [...data.occasions, occasion] }); }}>{t(name)}</button>)}</div></div>
      <div className="field"><Label htmlFor={`${id}-notes`}>{t("搭配笔记")}</Label><Textarea id={`${id}-notes`} rows={2} maxLength={3000} value={data.notes} onChange={event => onChange({ ...data, notes: event.target.value })}/></div>
    </div>
    <div className="item-picker-area">
      <div className="picker-title"><strong>{t("关联单品（可选）")}</strong><span>{t("已选 {count} / 30 件", { count: data.itemIds.length })}</span></div>
      <p className="field-hint">{t("可以只保存搭配照片，之后再来补选单品。")}</p>
      <div className="category-tabs outfit-picker-tabs" role="group" aria-label={t("筛选单品分类")}>{Object.entries({ all: t("全部"), ...translatedOptions(CATEGORIES, t) }).map(([value, name]) => <button type="button" key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{name}<span>{value === "all" ? selectable.length : selectable.filter(item => item.data.category === value).length}</span></button>)}</div>
      <div className="item-picker-scroll"><div className="item-grid item-picker-grid">{available.map(item => <ItemCard key={item.id} item={item} selection={{ selected: data.itemIds.includes(item.id), label: t("选择单品 {value1}", { value1: item.data.name }) }} onOpen={() => {
                if (!data.itemIds.includes(item.id) && data.itemIds.length >= 30)
                    return;
                onChange({ ...data, itemIds: data.itemIds.includes(item.id) ? data.itemIds.filter(value => value !== item.id) : [...data.itemIds, item.id] });
            }}/>)}</div></div>
      {!available.length && <p className="field-hint">{items.length ? t("这个分类里还没有单品。") : t("还没有衣橱单品，也可以直接保存照片搭配。")}</p>}
      {!!data.itemIds.length && <div className="selected-summary"><span>{t("已关联")}</span>{data.itemIds.map(value => <button type="button" key={value} onClick={() => onChange({ ...data, itemIds: data.itemIds.filter(itemId => itemId !== value) })}>{items.find(item => item.id === value)?.data.name}<X size={12}/></button>)}</div>}
    </div>
  </div>;
}
