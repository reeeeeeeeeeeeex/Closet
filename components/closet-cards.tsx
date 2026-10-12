/* eslint-disable @next/next/no-img-element -- Display authenticated original images. */
"use client";
import { assetUrl } from "@/lib/profile-client";
import { useState } from "react";
import { PhotoViewer, type CropPhoto } from "@/components/photo-viewer";
import { ArrowUpRight, CalendarDays, Check, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { itemColorStyle, itemColorText, isCommonColor } from "@/lib/colors";
import { ItemLabels } from "@/components/item-details";
import { CATEGORIES, OCCASIONS, photoAssets, type Item, type ItemRecord, type OutfitRecord } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/provider";

export function Photo({ asset, name, className = "", onOpen }: {
    asset: string | null;
    name: string;
    className?: string;
    onOpen?: () => void;
}) {
    const { t } = useI18n();
    const content = asset ? <img src={assetUrl(asset)} alt={name} loading="lazy" onError={e => { e.currentTarget.style.opacity = ".2"; }}/> : <div className="photo-placeholder"><Shirt strokeWidth={1}/><span>{t("未添加照片")}</span></div>;
    return onOpen ? <button type="button" className={`photo ${className}`} onClick={onOpen} aria-label={t("展开 {name} 的大图", { name })}>{content}</button> : <div className={`photo ${className}`}>{content}</div>;
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

type CardSelection = { selected: boolean; label: string; indicators?: string[] };

function SelectionMarker({ selection }: { selection: CardSelection }) {
    return <><span className="pick-check" aria-hidden="true">{selection.selected && <Check size={13}/>}</span>{!!selection.indicators?.length && <div className="card-indicators">{selection.indicators.map(label => <small key={label}>{label}</small>)}</div>}</>;
}

export function ItemCard({ item, onOpen, selection, onCrop }: { item: ItemRecord; onOpen: () => void; selection?: CardSelection; onCrop?: CropPhoto }) {
    const { t } = useI18n();
    const [viewing, setViewing] = useState(false);
    const style = itemColorStyle(item.data);
    const first = style.values[0];
    const name = first ? isCommonColor(first) ? t(first.name) : first.name : "";
    const summary = !first ? "" : style.mode === "colorblock" ? t("拼色 · {count} 色", { count: style.values.length }) : style.mode === "primary" && style.values.length > 1 ? t("{name}＋{count} 辅色", { name, count: style.values.length - 1 }) : name;
    const details = <><div className="item-category" title={itemColorText(item.data)}>{t(CATEGORIES[item.data.category])}{summary && ` / ${summary}`}</div><h3>{item.data.name}</h3><OccasionLabels values={item.data.occasions}/><ItemLabels item={item.data} showMeasurements={false}/></>;
    if (selection) return <button type="button" className={`item-card selectable-card ${selection.selected ? 'picked' : ''}`} onClick={onOpen} aria-label={selection.label} aria-pressed={selection.selected}><Photo asset={item.data.asset} name={item.data.name}/><div className="item-card-body">{details}</div><SelectionMarker selection={selection}/></button>;
    return <><div className="item-card"><Photo asset={item.data.asset} name={item.data.name} onOpen={() => item.data.asset ? setViewing(true) : onOpen()}/><button type="button" className="item-card-body" onClick={onOpen} aria-label={t("编辑 {name}", { name: item.data.name })}>{details}<span className="card-edit"><ArrowUpRight size={18}/></span></button></div>
      {viewing && <PhotoViewer photos={photoAssets(item.data).map(hash => ({ key: hash, src: assetUrl(hash), asset: hash }))} initialKey={item.data.asset} name={item.data.name} onClose={() => setViewing(false)} onEdit={onOpen} onCrop={onCrop}/>}</>;
}

export function OutfitCard({ outfit, items, onOpen, onCalendar, selection, onCrop }: { outfit: OutfitRecord; items: ItemRecord[]; onOpen: () => void; onCalendar?: () => void; selection?: CardSelection; onCrop?: CropPhoto }) {
    const { t } = useI18n();
    const [viewing, setViewing] = useState(false);
    const visual = <OutfitCollage asset={outfit.data.asset} itemIds={outfit.data.itemIds} items={items}/>;
    const details = <><div className="item-category">{outfit.data.asset ? t("搭配照片 \u00B7 ") : ""}{outfit.data.itemIds.length ? t("{value1} 件单品", { value1: outfit.data.itemIds.length }) : t("未关联单品")}</div><h3>{outfit.data.name}</h3><OccasionLabels values={outfit.data.occasions}/></>;
    const photos = photoAssets(outfit.data);
    const viewPhotos = photos.length ? photos : [...new Set(outfit.data.itemIds.flatMap(id => { const item = items.find(value => value.id === id); return item ? photoAssets(item.data) : []; }))];
    const footer = <div className="outfit-footer"><span>{outfit.data.notes || t("喜欢的组合，留给刚好的日子。")}</span>{!selection && onCalendar && <Button type="button" variant="ghost" size="icon" aria-label={t("安排 {value1} 的穿搭日期", { value1: outfit.data.name })} onClick={onCalendar}><CalendarDays size={19}/></Button>}</div>;
    return selection
        ? <button type="button" className={`outfit-card selectable-card ${selection.selected ? "picked" : ""}`} onClick={onOpen} aria-label={selection.label} aria-pressed={selection.selected}>{visual}<div className="outfit-body">{details}</div>{footer}<SelectionMarker selection={selection}/></button>
        : <><div className="outfit-card"><button type="button" className="outfit-open" aria-label={t("展开 {name} 的大图", { name: outfit.data.name })} onClick={() => viewPhotos.length ? setViewing(true) : onOpen()}>{visual}</button><button type="button" className="outfit-body" onClick={onOpen} aria-label={t("编辑 {name}", { name: outfit.data.name })}>{details}</button>{footer}</div>
          {viewing && <PhotoViewer photos={viewPhotos.map(hash => ({ key: hash, src: assetUrl(hash), asset: hash }))} initialKey={outfit.data.asset} name={outfit.data.name} onClose={() => setViewing(false)} onEdit={onOpen} onCrop={photos.length ? onCrop : undefined}/>}</>;
}
