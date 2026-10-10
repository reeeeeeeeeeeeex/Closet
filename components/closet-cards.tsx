/* eslint-disable @next/next/no-img-element -- Display authenticated original images. */
"use client";
import { ArrowUpRight, CalendarDays, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemLabels } from "@/components/item-details";
import { CATEGORIES, OCCASIONS, type Item, type ItemRecord, type OutfitRecord } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/provider";

export function Photo({ asset, name, className = "" }: {
    asset: string | null;
    name: string;
    className?: string;
}) {
    const { t } = useI18n();
    return <div className={`photo ${className}`}>{asset ? <img src={`/api/assets/${asset}`} alt={name} loading="lazy" onError={e => { e.currentTarget.style.opacity = ".2"; }}/> : <div className="photo-placeholder"><Shirt strokeWidth={1}/><span>{t("未添加照片")}</span></div>}</div>;
}
export function OccasionLabels({ values }: {
    values: Item["occasions"];
}) { const { t } = useI18n(); return <div className="occasion-labels">{values.map(o => <span key={o}>{t(OCCASIONS[o])}</span>)}</div>; }
export function OutfitCollage({ asset, itemIds, items }: {
    asset?: string | null;
    itemIds: string[];
    items: ItemRecord[];
}) {
    const { t } = useI18n();
    return <div className="outfit-visual">{asset && <Photo asset={asset} name={t("搭配照片")} className="outfit-cover-photo"/>}
    {!!itemIds.length && <div className={asset ? "outfit-piece-strip" : `outfit-collage count-${Math.min(itemIds.length, 4)}`}>{itemIds.slice(0, 4).map(id => { const item = items.find(i => i.id === id); return item ? <Photo key={id} asset={item.data.asset} name={item.data.name}/> : null; })}{itemIds.length > 4 && <span className="more-pieces">+{itemIds.length - 4}</span>}</div>}
  </div>;
}

export function ItemCard({ item, onOpen }: { item: ItemRecord; onOpen: () => void }) {
const { t } = useI18n(); return <button className="item-card" onClick={onOpen}><Photo asset={item.data.asset} name={item.data.name}/><div className="item-card-body"><div className="item-category">{t(CATEGORIES[item.data.category])}{item.data.color && ` / ${item.data.color}`}</div><h3>{item.data.name}</h3><OccasionLabels values={item.data.occasions}/><ItemLabels item={item.data} showMeasurements={false}/></div><span className="card-edit"><ArrowUpRight size={18}/></span></button>;
}
export function OutfitCard({ outfit, items, onOpen, onCalendar }: { outfit: OutfitRecord; items: ItemRecord[]; onOpen: () => void; onCalendar: () => void }) {
const { t } = useI18n(); return <div className="outfit-card"><button className="outfit-open" onClick={onOpen}><OutfitCollage asset={outfit.data.asset} itemIds={outfit.data.itemIds} items={items}/><div className="outfit-body"><div className="item-category">{outfit.data.asset ? t("搭配照片 \u00B7 ") : ""}{outfit.data.itemIds.length ? t("{value1} 件单品", { value1: outfit.data.itemIds.length }) : t("未关联单品")}</div><h3>{outfit.data.name}</h3><OccasionLabels values={outfit.data.occasions}/></div></button><div className="outfit-footer"><span>{outfit.data.notes || t("喜欢的组合，留给刚好的日子。")}</span><Button variant="ghost" size="icon" aria-label={t("安排 {value1} 的穿搭日期", { value1: outfit.data.name })} onClick={onCalendar}><CalendarDays size={19}/></Button></div></div>;
}
