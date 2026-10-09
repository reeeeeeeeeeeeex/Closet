"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ItemLabels } from "@/components/item-details";
import { Photo, OutfitCollage, OccasionLabels } from "@/components/closet-cards";
import { CATEGORIES, OCCASIONS, type ClosetRecord, type ItemRecord, type Subset } from "@/lib/domain";
import { rootRecords } from "@/lib/subsets";
import { useI18n } from "@/lib/i18n/provider";

export function SubsetContentPicker({ records, data, inherited, onChange }: {
  records: ClosetRecord[]; data: Subset; inherited: Set<string>; onChange: (memberIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [occasion, setOccasion] = useState("all");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const candidates = rootRecords(records, data.scope, data.root);
  const items = records.filter((record): record is ItemRecord => record.kind === "item");
  const visible = candidates.filter(candidate => (!candidate.data.archived || data.memberIds.includes(candidate.id))
    && (!selectedOnly || data.memberIds.includes(candidate.id))
    && (candidate.kind !== "item" || category === "all" || candidate.data.category === category)
    && (occasion === "all" || candidate.data.occasions.some(value => value === occasion))
    && [candidate.data.name, candidate.data.notes, candidate.kind === "item" ? candidate.data.color : ""].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function toggle(id: string) { onChange(data.memberIds.includes(id) ? data.memberIds.filter(value => value !== id) : [...data.memberIds, id]); }
  return <div className="subset-picker">
    <div className="picker-title"><strong>{t("选择内容（可选）")}</strong><button type="button" className={`chip ${selectedOnly ? "selected" : ""}`} aria-pressed={selectedOnly} onClick={() => { setSelectedOnly(!selectedOnly); if (!selectedOnly) { setCategory("all"); setOccasion("all"); setSearch(""); } }}>{t("查看已选 {count} 条", { count: data.memberIds.length })}</button></div>
    <Input type="search" aria-label={t("搜索可加入的单品或搭配")} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("搜索可加入的单品或搭配")}/>
    {data.scope === "item" && data.root === "all" && <div className="category-tabs subset-picker-tabs" role="group" aria-label={t("单品分类")}>{Object.entries({ all: t("全部"), ...CATEGORIES }).map(([key, label]) => <button type="button" key={key} className={category === key ? "active" : ""} onClick={() => setCategory(key)}>{t(label)}</button>)}</div>}
    {data.scope === "item" && data.root !== "all" && <p className="field-hint">{t("当前分类：{name}", { name: t(CATEGORIES[data.root]) })}</p>}
    {data.scope === "outfit" && <div className="chip-row" role="group" aria-label={t("场合筛选")}>{Object.entries({ all: t("所有场合"), ...OCCASIONS }).map(([key, label]) => <button type="button" key={key} className={`chip ${occasion === key ? "selected" : ""}`} aria-pressed={occasion === key} onClick={() => setOccasion(key)}>{t(label)}</button>)}</div>}
    <div className="subset-pick-grid">{visible.map(candidate => <button type="button" className={`item-card subset-pick-card ${data.memberIds.includes(candidate.id) ? "picked" : ""}`} key={candidate.id} aria-label={t("选择内容 {name}", { name: candidate.data.name })} aria-pressed={data.memberIds.includes(candidate.id)} onClick={() => toggle(candidate.id)}>
      {candidate.kind === "item" ? <Photo asset={candidate.data.asset} name={candidate.data.name}/> : <OutfitCollage asset={candidate.data.asset} itemIds={candidate.data.itemIds} items={items}/>}
      <div className="item-card-body"><div className="item-category">{candidate.kind === "item" ? t(CATEGORIES[candidate.data.category]) : candidate.data.asset ? t("搭配照片") : t("单品搭配")}</div><h3>{candidate.data.name}</h3><OccasionLabels values={candidate.data.occasions}/>{candidate.kind === "item" && <ItemLabels item={candidate.data}/>}{inherited.has(candidate.id) && <small>{t("已包含在下级分组中")}</small>}{candidate.data.archived && <small>{t("已收起")}</small>}</div><span className="pick-check">{data.memberIds.includes(candidate.id) && <Check size={13}/>}</span>
    </button>)}</div>
    {!visible.length && <p className="field-hint">{t("当前筛选下没有可选内容，可切换分类或清空搜索。")}</p>}
    {!!data.memberIds.length && <div className="selected-summary"><span>{t("直接加入 {count} 条", { count: data.memberIds.length })}</span>{data.memberIds.map(id => <button type="button" key={id} aria-label={t("取消选择 {name}", { name: candidates.find(candidate => candidate.id === id)?.data.name || t("记录不存在") })} onClick={() => toggle(id)}>{candidates.find(candidate => candidate.id === id)?.data.name || t("记录不存在")}<X size={12}/></button>)}</div>}
  </div>;
}
