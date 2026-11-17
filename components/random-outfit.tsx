"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripVertical, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIES, type ItemRecord, type RandomOutfitRulesRecord } from "@/lib/domain";
import { defaultOutfitRules, moveTo, outfitCandidates, randomOutfit, type CategoryRule, type RandomOutfitRules } from "@/lib/random-outfit";
import { useI18n } from "@/lib/i18n/provider";

type SortGroup = "categories" | CategoryRule["category"];
type SortRow = { group: SortGroup; id: string };
type Drag = SortRow & { x: number; y: number; frame: number; cleanup: () => void };

function useRuleDrag(onMove: (group: SortGroup, from: string, to: string) => void) {
  const { t } = useI18n();
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SortRow | null>(null);
  const [target, setTarget] = useState<SortRow | null>(null);

  useEffect(() => () => drag.current?.cleanup(), []);

  function rowAt(current: Drag, x: number, y: number) {
    return document.elementFromPoint(x, y)?.closest<HTMLElement>(`[data-sort-group="${current.group}"]`)?.dataset.sortId;
  }

  function track() {
    const current = drag.current;
    if (!current) return;
    const bounds = scroller.current?.getBoundingClientRect();
    if (bounds) {
      const edge = Math.min(44, bounds.height / 4);
      if (current.y < bounds.top + edge) scroller.current?.scrollBy(0, -10);
      if (current.y > bounds.bottom - edge) scroller.current?.scrollBy(0, 10);
    }
    const id = rowAt(current, current.x, current.y);
    setTarget(previous => previous?.id === id ? previous : id ? { group: current.group, id } : null);
    current.frame = requestAnimationFrame(track);
  }

  function handle(group: SortGroup, id: string, name: string, ids: string[]) {
    return {
      "aria-label": t("拖动 {name} 排序，也可使用上下方向键", { name }),
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        const pointer = event.pointerId;
        const current = { group, id, x: event.clientX, y: event.clientY, frame: requestAnimationFrame(track), cleanup };
        function cleanup() {
          cancelAnimationFrame(current.frame);
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", drop, true);
          window.removeEventListener("pointercancel", cancel, true);
          window.removeEventListener("blur", finish);
          drag.current = null;
        }
        function finish() {
          cleanup();
          setActive(null);
          setTarget(null);
        }
        function move(next: globalThis.PointerEvent) {
          if (next.pointerId !== pointer) return;
          current.x = next.clientX;
          current.y = next.clientY;
        }
        function drop(next: globalThis.PointerEvent) {
          if (next.pointerId !== pointer) return;
          const targetId = rowAt(current, next.clientX, next.clientY);
          finish();
          if (targetId && targetId !== id) onMove(group, id, targetId);
        }
        function cancel(next: globalThis.PointerEvent) {
          if (next.pointerId === pointer) finish();
        }
        drag.current = current;
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", drop, true);
        window.addEventListener("pointercancel", cancel, true);
        window.addEventListener("blur", finish);
        setActive({ group, id });
      },
      onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const neighbor = ids[ids.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)];
        if (neighbor) onMove(group, id, neighbor);
      },
    };
  }

  function row(group: SortGroup, id: string) {
    return {
      "data-sort-group": group,
      "data-sort-id": id,
      "data-dragging": (active?.group === group && active.id === id) || undefined,
      "data-drop-target": (target?.group === group && target.id === id && active?.id !== id) || undefined,
    };
  }
  return { handle, row, scroller };
}

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

  const { handle, row, scroller } = useRuleDrag((group, from, to) => {
    if (group === "categories") {
      update(moveTo(rules.categories, categoryIds.findIndex(id => id === from), categoryIds.findIndex(id => id === to)));
    } else {
      const ids = rules.categories.find(rule => rule.category === group)?.itemIds;
      if (ids) setCandidates(group, moveTo(ids, ids.indexOf(from), ids.indexOf(to)));
    }
  });

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
                  {rule.itemIds !== null && !!available.length && <select className="random-rule-select" aria-label={t("向 {name} 添加候选单品", { name: categoryName })} value="" onChange={event => {
                    if (event.target.value) setCandidates(rule.category, [...itemIds, event.target.value]);
                  }}>
                    <option value="">{t("添加候选单品")}</option>
                    {available.map(item => <option value={item.id} key={item.id}>{item.data.name}</option>)}
                  </select>}
                </div>
              </li>;
            })}
          </ol>
          {!!availableCategories.length && <select className="random-rule-select" aria-label={t("添加分类")} value="" onChange={event => {
            if (event.target.value) update([...rules.categories, { category: event.target.value as CategoryRule["category"], itemIds: null }]);
          }}>
            <option value="">{t("添加分类")}</option>
            {availableCategories.map(category => <option key={category} value={category}>{t(CATEGORIES[category])}</option>)}
          </select>}
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
