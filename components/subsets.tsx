"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { SubsetContentPicker } from "@/components/subset-content-picker";
import { CATEGORIES, type ClosetRecord, type ItemRecord, type OutfitRecord, type Subset, type SubsetRecord } from "@/lib/domain";
import { subsetMemberIds, subsetTrail, subsetSections, type SubsetSection } from "@/lib/subsets";
import { tr } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";

type SaveSubset = (data: Subset, record?: SubsetRecord) => Promise<string>;
export function SubsetBrowser({ records, scope, root, activeId, disabled, onSelect, onSave, onDelete, visibleRecords, renderCards, onAdd }: {
  records: ClosetRecord[]; scope: Subset["scope"]; root: Subset["root"]; activeId: string | null; disabled: boolean;
  onSelect: (id: string | null) => void; onSave: SaveSubset; visibleRecords: (ItemRecord | OutfitRecord)[];
  onDelete: (record: SubsetRecord) => Promise<void>;
  renderCards: (records: (ItemRecord | OutfitRecord)[]) => ReactNode; onAdd: (subsetId: string) => void;
}) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<{ record?: SubsetRecord; parentId: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const active = records.find((record): record is SubsetRecord => record.kind === "subset" && record.id === activeId && record.data.scope === scope && record.data.root === root);
  const trail = active ? subsetTrail(records, active.id) : [];
  const rootName = scope === "outfit" ? t("全部搭配") : root === "all" ? t("全部") : t(CATEGORIES[root]);
  const { sections, ungrouped } = subsetSections(records, scope, root, active?.id || null, visibleRecords);
  function toggle(id: string) { setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function renderSection(section: SubsetSection): ReactNode {
    const { subset, count } = section; const open = !collapsed.has(subset.id); const contentId = "subset-content-" + subset.id;
    return <section className="subset-section" key={subset.id} data-subset-id={subset.id}>
      <div className="subset-section-heading">
        <button type="button" className="subset-toggle" aria-expanded={open} aria-controls={contentId} aria-label={t("展开或折叠分组 {name}", { name: subset.data.name })} onClick={() => toggle(subset.id)}>{open ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>
        <button type="button" className="subset-title" onClick={() => onSelect(subset.id)}>{subset.data.name}</button><span className="subset-count">{t("{count} 条内容", { count })}</span>
        <div className="subset-actions"><Button variant="ghost" size="sm" disabled={disabled} onClick={() => setDialog({ record: subset, parentId: subset.data.parentId })}><Pencil size={14}/>{t("编辑")}</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => setDialog({ record: subset, parentId: subset.data.parentId })}>{t("添加内容")}</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAdd(subset.id)}><Plus size={14}/>{scope === "item" ? t("添加单品") : t("新建搭配")}</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => setDialog({ parentId: subset.id })}><FolderPlus size={14}/>{t("新建分组")}</Button></div>
      </div>
      {open && <div id={contentId} className="subset-section-content">{section.children.map(renderSection)}{!!section.records.length && renderCards(section.records)}{!count && <p className="field-hint">{t("此分组在当前筛选下没有内容。")}</p>}</div>}
    </section>;
  }
  return <section className="subset-browser" aria-label={t("分组管理")}>
    <div className="subset-toolbar"><nav className="subset-path" aria-label={t("分组路径")}><button type="button" onClick={() => onSelect(null)}>{rootName}</button>{trail.map(record => <span key={record.id}><ChevronRight size={14} /><button type="button" aria-current={record.id === active?.id ? "page" : undefined} onClick={() => onSelect(record.id)}>{record.data.name}</button></span>)}</nav>
      <div className="subset-actions">{active && <><Button variant="ghost" size="sm" disabled={disabled} onClick={() => setDialog({ record: active, parentId: active.data.parentId })}><Pencil size={15}/>{t("编辑分组")}</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAdd(active.id)}><Plus size={15}/>{scope === "item" ? t("添加单品") : t("新建搭配")}</Button></>}<Button variant="outline" size="sm" disabled={disabled} onClick={() => setDialog({ parentId: active?.id || null })}><FolderPlus size={16}/>{t("新建分组")}</Button></div>
    </div>
    {sections.map(renderSection)}
    {!!ungrouped.length && <section className="subset-ungrouped">{!!sections.length && <h2>{t("未分组")}</h2>}{renderCards(ungrouped)}</section>}
    {dialog && <SubsetEditor key={dialog.record?.id || dialog.parentId || "root"} record={dialog.record} preset={{ scope, root, parentId: dialog.parentId }} records={records} onClose={() => setDialog(null)} onSave={async (data, record) => { await onSave(data, record); setDialog(null); }} onDelete={async record => { await onDelete(record); setDialog(null); }} />}
  </section>;
}

export function SubsetEditor({ record, preset, records, onClose, onSave, onDelete }: {
  record?: SubsetRecord; preset: Pick<Subset, "scope" | "root" | "parentId">; records: ClosetRecord[];
  onClose: () => void; onSave: (data: Subset, record?: SubsetRecord) => Promise<void>;
  onDelete: (record: SubsetRecord) => Promise<void>;
}) {
  const { t } = useI18n(); const [data, setData] = useState<Subset>(record?.data || { ...preset, name: "", memberIds: [] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inherited = useMemo(() => {
    const members = new Set<string>();
    if (record) for (const child of records) if (child.kind === "subset" && child.data.parentId === record.id) for (const member of subsetMemberIds(records, child.id)) members.add(member);
    return members;
  }, [record, records]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { if (!data.name.trim()) throw new Error(t("请填写分组名称")); await onSave(data, record); }
    catch (error) { setError(error instanceof Error ? tr(error.message) : t("保存分组失败，请重试")); setBusy(false); }
  }
  async function remove() {
    if (!record) return;
    setBusy(true); setError("");
    try { await onDelete(record); }
    catch (error) { setError(error instanceof Error ? tr(error.message) : t("删除分组失败，请重试")); setBusy(false); }
  }
  return <><Dialog open onOpenChange={(open: boolean) => { if (!open && !busy) onClose(); }}><DialogContent className="closet-dialog editor-dialog subset-dialog"><DialogHeader><DialogTitle>{record ? t("编辑分组") : t("新建分组")}</DialogTitle><DialogDescription>{t("可以先创建空分组，再添加内容。下级分组的内容会自动汇总到上级分组。")}</DialogDescription></DialogHeader>
    <form onSubmit={event => void submit(event)}><fieldset disabled={busy}><div className="form-fields"><div className="field"><Label htmlFor="subset-name">{t("分组名称")}</Label><Input id="subset-name" autoFocus required maxLength={100} value={data.name} onChange={event => setData({ ...data, name: event.target.value })} placeholder={t("例如：春季通勤、运动鞋、旅行穿搭")} /></div>
      <SubsetContentPicker records={records} data={data} inherited={inherited} onChange={memberIds => setData({ ...data, memberIds })}/>
    </div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<DialogFooter className="editor-footer">{record && <Button type="button" variant="destructive" disabled={busy} onClick={() => { setError(""); setConfirmDelete(true); }}><Trash2 size={15}/>{t("删除分组")}</Button>}<Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("取消")}</Button><Button type="submit" disabled={busy}>{busy ? t("保存中…") : t("保存分组")}</Button></DialogFooter></form>
  </DialogContent></Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={open => { if (!busy) setConfirmDelete(open); }}><AlertDialogContent className="closet-dialog"><AlertDialogHeader><AlertDialogTitle>{t("删除分组 {name}？", { name: record?.data.name || "" })}</AlertDialogTitle><AlertDialogDescription>{t("只删除此分组，下级分组和直接归属内容移到上一级。单品和搭配本身会保留。")}</AlertDialogDescription></AlertDialogHeader>{error && <p className="form-error" role="alert">{error}</p>}<AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>{t("取消")}</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? t("删除中…") : t("确认删除分组")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
