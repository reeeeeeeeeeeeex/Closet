/* eslint-disable @next/next/no-img-element -- Originals and blob previews bypass image optimization. */
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Shirt, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemLabels } from "@/components/item-details";
import { CATEGORIES, OCCASIONS, type ItemRecord, type Outfit } from "@/lib/domain";

export function OutfitFields({ data, onChange, file, onFile, items, onError }: {
  data: Outfit; onChange: (data: Outfit) => void; file: File | null; onFile: (file: File | null) => void;
  items: ItemRecord[]; onError: (message: string) => void;
}) {
  const id = useId(); const camera = useRef<HTMLInputElement>(null); const library = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(""); const [filter, setFilter] = useState("all");
  // Object URLs belong to the browser and must be released when the file changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const url = file ? URL.createObjectURL(file) : ""; setPreview(url); return () => { if (url) URL.revokeObjectURL(url); }; }, [file]);
  function choose(input: HTMLInputElement) {
    const selected = input.files?.[0]; input.value = "";
    if (!selected) return;
    if (selected.size > 20 * 1024 * 1024) { onError("单张图片最多 20 MB"); return; }
    onFile(selected); onError("");
  }
  const photo = preview || (data.asset ? `/api/assets/${data.asset}` : "");
  const available = items.filter(item => (!item.data.archived || data.itemIds.includes(item.id)) && (filter === "all" || item.data.category === filter));
  return <div className="outfit-draft">
    <div className="outfit-draft-photo">
      {photo ? <img src={photo} alt="搭配照片预览" /> : <div className="outfit-photo-placeholder"><ImagePlus size={32} strokeWidth={1.4} /><span>添加上身照或整套搭配照片</span></div>}
      <div className="photo-actions">
        <Button type="button" variant="outline" onClick={() => camera.current?.click()}><Camera size={16} />拍照</Button>
        <Button type="button" variant="outline" onClick={() => library.current?.click()}><Upload size={16} />{photo ? "更换照片" : "导入照片"}</Button>
        {photo && <Button type="button" variant="ghost" onClick={() => { onFile(null); onChange({ ...data, asset: null }); }}>移除照片</Button>}
      </div>
      <input ref={camera} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" capture="environment" aria-label="拍摄搭配照片" onChange={event => choose(event.currentTarget)} />
      <input ref={library} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="导入搭配照片" onChange={event => choose(event.currentTarget)} />
    </div>
    <div className="form-fields">
      <div className="field"><Label htmlFor={`${id}-name`}>搭配名称</Label><Input id={`${id}-name`} required maxLength={100} value={data.name} onChange={event => onChange({ ...data, name: event.target.value })} placeholder="例如：轻松的周五" /></div>
      <div className="field"><Label>适合场合</Label><div className="chip-row">{Object.entries(OCCASIONS).map(([value, name]) => <button type="button" key={value} className={`chip ${data.occasions.includes(value as Outfit["occasions"][number]) ? "selected" : ""}`} aria-pressed={data.occasions.includes(value as Outfit["occasions"][number])} onClick={() => { const occasion = value as Outfit["occasions"][number]; onChange({ ...data, occasions: data.occasions.includes(occasion) ? data.occasions.filter(o => o !== occasion) : [...data.occasions, occasion] }); }}>{name}</button>)}</div></div>
      <div className="field"><Label htmlFor={`${id}-notes`}>搭配笔记</Label><Textarea id={`${id}-notes`} rows={2} maxLength={3000} value={data.notes} onChange={event => onChange({ ...data, notes: event.target.value })} /></div>
    </div>
    <div className="item-picker-area">
      <div className="picker-title"><strong>关联单品（可选）</strong><span>已选 {data.itemIds.length} / 30 件</span></div>
      <p className="field-hint">可以只保存搭配照片，之后再来补选单品。</p>
      <Label htmlFor={`${id}-category`} className="sr-only">筛选单品分类</Label><select id={`${id}-category`} className="outfit-category-filter" value={filter} onChange={event => setFilter(event.target.value)}>{Object.entries({ all: "全部分类", ...CATEGORIES }).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
      <div className="item-picker-grid">{available.map(item => <button type="button" key={item.id} className={`pick-item ${data.itemIds.includes(item.id) ? "picked" : ""}`} aria-pressed={data.itemIds.includes(item.id)} aria-label={`选择单品 ${item.data.name}`} onClick={() => {
        if (!data.itemIds.includes(item.id) && data.itemIds.length >= 30) return;
        onChange({ ...data, itemIds: data.itemIds.includes(item.id) ? data.itemIds.filter(value => value !== item.id) : [...data.itemIds, item.id] });
      }}><div className="photo">{item.data.asset ? <img src={`/api/assets/${item.data.asset}`} alt={item.data.name} loading="lazy" /> : <div className="photo-placeholder"><Shirt strokeWidth={1} /></div>}</div><span className="pick-name">{item.data.name}</span><ItemLabels item={item.data} /><span className="pick-check">{data.itemIds.includes(item.id) && <Check size={13} />}</span></button>)}</div>
      {!available.length && <p className="field-hint">{items.length ? "这个分类里还没有单品。" : "还没有衣橱单品，也可以直接保存照片搭配。"}</p>}
      {!!data.itemIds.length && <div className="selected-summary"><span>已关联</span>{data.itemIds.map(value => <button type="button" key={value} onClick={() => onChange({ ...data, itemIds: data.itemIds.filter(itemId => itemId !== value) })}>{items.find(item => item.id === value)?.data.name}<X size={12} /></button>)}</div>}
    </div>
  </div>;
}
