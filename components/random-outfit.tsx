"use client";

import { useRef, useState } from "react";
import { GripVertical, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type ItemRecord, type RandomOutfitRulesRecord } from "@/lib/domain";
import { defaultOutfitRules, moveTo, outfitCandidates, randomOutfit, type CategoryRule, type RandomOutfitRules } from "@/lib/random-outfit";
import { useI18n } from "@/lib/i18n/provider";

import { useSortDrag } from "@/components/use-sort-drag";

export function RandomOutfitEditor({ record, items, disabled, onClose, onSave, onUse }: {
  record?: RandomOutfitRulesRecord;
  items: ItemRecord[];
  disabled: boolean;
  onClose: () => void;
  onSave: (data: RandomOutfitRules, record?: RandomOutfitRulesRecord) => Promise<RandomOutfitRulesRecord>;
  onUse: (itemIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [rules, setRules] = useState(() => record?.data || defaultOutfitRules(items));
  const [saved, setSaved] = useState(record);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const itemById = new Map(items.map(item => [item.id, item]));
  const categoryIds = rules.categories.map(rule => rule.category);
  const availableCategories = (Object.keys(CATEGORIES) as CategoryRule["category"][]).filter(category => !categoryIds.includes(category));

  function update(categories: CategoryRule[]) {
    setRules({ categories });
    setResult([]);
    setError("");
    setSavedNotice(false);
  }

  function setCandidates(category: CategoryRule["category"], itemIds: string[] | null) {
    update(rules.categories.map(rule => rule.category === category ? { ...rule, itemIds } : rule));
  }

  const scroller = useRef<HTMLDivElement>(null);
  const { handle, row } = useSortDrag((group, from, to) => {
    if (group === "categories") {
      update(moveTo(rules.categories, categoryIds.findIndex(id => id === from), categoryIds.findIndex(id => id === to)));
    } else {
      const rule = rules.categories.find(rule => rule.category === group);
      if (rule?.itemIds) setCandidates(rule.category, moveTo(rule.itemIds, rule.itemIds.indexOf(from), rule.itemIds.indexOf(to)));
    }
  }, () => scroller.current);

  function draw() {
    setError("");
    const { itemIds, emptyCategories } = randomOutfit(rules, items);
    setResult(emptyCategories.length ? [] : itemIds);
    if (emptyCategories.length) setError(t("这些分类没有可用的候选单品：{names}", { names: emptyCategories.map(category => t(CATEGORIES[category])).join(t("、")) }));
    requestAnimationFrame(() => feedback.current?.scrollIntoView({ block: "nearest" }));
  }

  async function saveRules() {
    setBusy(true);
    setError("");
    try { setSaved(await onSave(rules, saved)); setSavedNotice(true); }
    catch (cause) { setError(cause instanceof Error ? t(cause.message) : t("操作失败，请重试")); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="closet-dialog random-outfit-dialog">
      <DialogHeader>
        <DialogTitle>{t("随机穿搭")}</DialogTitle>
        <DialogDescription>{t("每个分类随机抽一件，按分类顺序展示。拖动手柄可调整分类和组内单品的顺序。")}</DialogDescription>
      </DialogHeader>
      <div className="random-outfit-scroll" ref={scroller}>
        <fieldset disabled={busy || disabled} className="random-outfit-fields">
          <ol className="random-rule-list">
            {rules.categories.map(rule => {
              const categoryName = t(CATEGORIES[rule.category]);
              const itemIds = rule.itemIds || [];
              const all = outfitCandidates({ ...rule, itemIds: null }, items);
              const available = all.filter(item => !itemIds.includes(item.id));
              return <li className="random-rule" key={rule.category} {...row("categories", rule.category)}>
                <div className="random-rule-heading">
                  <Button type="button" variant="ghost" size="icon-sm" className="random-drag-handle" {...handle("categories", rule.category, categoryName, categoryIds)}><GripVertical size={19}/></Button>
                  <h3>{categoryName}</h3>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("移除分类 {name}", { name: categoryName })} onClick={() => update(rules.categories.filter(value => value.category !== rule.category))}><X size={16}/></Button>
                </div>
                <div className="random-rule-content">
                  {rule.itemIds === null ? <div className="random-rule-pool">
                    <p className="field-hint">{t("使用分类内全部单品（{count}）", { count: all.length })}</p>
                    {!!all.length && <Button type="button" size="sm" variant="ghost" onClick={() => setCandidates(rule.category, all.map(item => item.id))}>{t("自选候选单品")}</Button>}
                  </div> : <>
                    <ol className="random-rule-list random-item-list">
                      {itemIds.map(id => {
                        const item = itemById.get(id);
                        const name = item?.data.name || t("已删除的单品");
                        return <li className="random-item" key={id} {...row(rule.category, id)}>
                          <Button type="button" variant="ghost" size="icon-sm" className="random-drag-handle" {...handle(rule.category, id, name, itemIds)}><GripVertical size={16}/></Button>
                          <span>{name}{(!item || item.data.archived || item.data.category !== rule.category) && <small> · {t("不可用")}</small>}</span>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("移除候选单品 {name}", { name })} onClick={() => setCandidates(rule.category, itemIds.filter(value => value !== id))}><X size={16}/></Button>
                        </li>;
                      })}
                    </ol>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCandidates(rule.category, null)}>{t("使用全部单品")}</Button>
                  </>}
                  {rule.itemIds !== null && !!available.length && <Select value="" onValueChange={value => {
                    if (value) setCandidates(rule.category, [...itemIds, value]);
                  }}>
                    <SelectTrigger className="random-rule-select" aria-label={t("向 {name} 添加候选单品", { name: categoryName })}>
                      <SelectValue placeholder={t("添加候选单品")}/>
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {available.map(item => <SelectItem value={item.id} key={item.id}>{item.data.name}</SelectItem>)}
                    </SelectContent>
                  </Select>}
                </div>
              </li>;
            })}
          </ol>
          {!!availableCategories.length && <Select value="" onValueChange={value => {
            if (value) update([...rules.categories, { category: value as CategoryRule["category"], itemIds: null }]);
          }}>
            <SelectTrigger className="random-rule-select" aria-label={t("添加分类")}>
              <SelectValue placeholder={t("添加分类")}/>
            </SelectTrigger>
            <SelectContent position="popper">
              {availableCategories.map(category => <SelectItem key={category} value={category}>{t(CATEGORIES[category])}</SelectItem>)}
            </SelectContent>
          </Select>}
        </fieldset>
        <div ref={feedback}>
          {error && <p className="form-error" role="alert">{error}</p>}
          {savedNotice && <p className="field-hint" role="status">{t("随机穿搭规则已保存")}</p>}
          {!!result.length && <section className="random-result" aria-live="polite">
            <h3>{t("随机结果")}</h3>
            <ol>{result.map(id => <li key={id}>{itemById.get(id)?.data.name}</li>)}</ol>
            <Button type="button" size="sm" disabled={disabled || busy} onClick={() => onUse(result)}>{t("用结果新建搭配")}</Button>
          </section>}
        </div>
      </div>
      <DialogFooter className="random-outfit-footer">
        <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => void saveRules()}>{busy ? t("保存中…") : t("保存规则")}</Button>
        <Button type="button" disabled={busy || disabled || !rules.categories.length} onClick={draw}><Shuffle size={16}/>{result.length ? t("再抽一次") : t("随机生成")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
