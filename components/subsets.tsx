"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderPlus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemLabels } from "@/components/item-details";
import { CATEGORIES, type ClosetRecord, type Subset, type SubsetRecord } from "@/lib/domain";
import { rootRecords, subsetMemberIds, subsetTrail } from "@/lib/subsets";
import { tr } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";

type SaveSubset = (data: Subset, record?: SubsetRecord) => Promise<string>;
export function SubsetBrowser({ records, scope, root, activeId, archived, disabled, onSelect, onSave }: {
  records: ClosetRecord[]; scope: Subset["scope"]; root: Subset["root"]; activeId: string | null; archived: boolean; disabled: boolean;
  onSelect: (id: string | null) => void; onSave: SaveSubset;
}) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<{ record?: SubsetRecord; parentId: string | null } | null>(null);
  const subsets = records.filter((record): record is SubsetRecord => record.kind === "subset" && record.data.scope === scope && record.data.root === root);
  const active = subsets.find(record => record.id === activeId);
  const children = subsets.filter(record => record.data.parentId === (active?.id || null));
  const trail = active ? subsetTrail(records, active.id) : [];
  const rootName = scope === "outfit" ? t("全部搭配") : root === "all" ? t("全部") : t(CATEGORIES[root]);
  const eligible = rootRecords(records, scope, root).filter(record => record.data.archived === archived);
  function count(id: string) { const members = subsetMemberIds(records, id); return eligible.filter(record => members.has(record.id)).length; }
  return <section className="subset-browser" aria-label={t("子集管理")}>
    <div className="subset-toolbar"><nav className="subset-path" aria-label={t("子集路径")}><button type="button" onClick={() => onSelect(null)}>{rootName}</button>{trail.map(record => <span key={record.id}><ChevronRight size={14} /><button type="button" aria-current={record.id === active?.id ? "page" : undefined} onClick={() => onSelect(record.id)}>{record.data.name}</button></span>)}</nav>
      <div className="subset-actions">{active && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setDialog({ record: active, parentId: active.data.parentId })}><Pencil size={15} />{t("编辑子集")}</Button>}<Button variant="outline" size="sm" disabled={disabled} onClick={() => setDialog({ parentId: active?.id || null })}><FolderPlus size={16} />{t("新建子集")}</Button></div>
    </div>
    {!!children.length && <div className="subset-grid">{children.map(record => <button type="button" className="subset-card" key={record.id} onClick={() => onSelect(record.id)}><Folder size={23} strokeWidth={1.5} /><strong>{record.data.name}</strong><span>{t("{count} 条内容", { count: count(record.id) })}</span><ChevronRight size={16} /></button>)}</div>}
    {active && <p className="subset-hint">{t("包含当前子集及全部下级子集的内容。单品或搭配可以同时属于多个子集。")}</p>}
    {dialog && <SubsetEditor key={dialog.record?.id || dialog.parentId || "root"} record={dialog.record} preset={{ scope, root, parentId: dialog.parentId }} records={records} onClose={() => setDialog(null)} onSave={async (data, record) => { const id = await onSave(data, record); setDialog(null); onSelect(id); }} />}
  </section>;
}

export function SubsetEditor({ record, preset, records, onClose, onSave }: {
  record?: SubsetRecord; preset: Pick<Subset, "scope" | "root" | "parentId">; records: ClosetRecord[];
  onClose: () => void; onSave: (data: Subset, record?: SubsetRecord) => Promise<void>;
}) {
  const { t } = useI18n(); const [data, setData] = useState<Subset>(record?.data || { ...preset, name: "", memberIds: [] });
  const [search, setSearch] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const candidates = rootRecords(records, data.scope, data.root);
  const inherited = useMemo(() => {
    const members = new Set<string>();
    if (record) for (const child of records) if (child.kind === "subset" && child.data.parentId === record.id) for (const member of subsetMemberIds(records, child.id)) members.add(member);
    return members;
  }, [record, records]);
  const visible = candidates.filter(candidate => (!candidate.data.archived || data.memberIds.includes(candidate.id)) && candidate.data.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { if (!data.name.trim()) throw new Error(t("请填写子集名称")); await onSave(data, record); }
    catch (error) { setError(error instanceof Error ? tr(error.message) : t("保存子集失败，请重试")); setBusy(false); }
  }
  return <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy) onClose(); }}><DialogContent className="editor-dialog subset-dialog"><DialogHeader><DialogTitle>{record ? t("编辑子集") : t("新建子集")}</DialogTitle><DialogDescription>{t("可以先创建空子集，再添加内容。下级子集的内容会自动汇总到父集。")}</DialogDescription></DialogHeader>
    <form onSubmit={event => void submit(event)}><fieldset disabled={busy}><div className="form-fields"><div className="field"><Label htmlFor="subset-name">{t("子集名称")}</Label><Input id="subset-name" autoFocus required maxLength={100} value={data.name} onChange={event => setData({ ...data, name: event.target.value })} placeholder={t("例如：春季通勤、运动鞋、旅行穿搭")} /></div>
      <div className="field"><Label htmlFor="subset-search">{t("选择内容（可选）")}</Label><Input id="subset-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("搜索可加入的单品或搭配")} /></div>
      <div className="subset-members">{visible.map(candidate => <label className="subset-member" key={candidate.id}><input type="checkbox" checked={data.memberIds.includes(candidate.id)} onChange={event => setData({ ...data, memberIds: event.target.checked ? [...data.memberIds, candidate.id] : data.memberIds.filter(id => id !== candidate.id) })} /><div><strong>{candidate.data.name}</strong>{candidate.kind === "item" && <ItemLabels item={candidate.data} />}{inherited.has(candidate.id) && <small>{t("已包含在下级子集中")}</small>}{candidate.data.archived && <small>{t("已收起")}</small>}</div></label>)}</div>
      {!visible.length && <p className="field-hint">{t("暂无可选择的内容，仍然可以创建空子集。")}</p>}
      {!!data.memberIds.length && <div className="selected-summary"><span>{t("直接加入 {count} 条", { count: data.memberIds.length })}</span>{data.memberIds.map(id => <button type="button" key={id} onClick={() => setData({ ...data, memberIds: data.memberIds.filter(value => value !== id) })}>{candidates.find(candidate => candidate.id === id)?.data.name || t("记录不存在")}<X size={12} /></button>)}</div>}
    </div></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<DialogFooter className="editor-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("取消")}</Button><Button type="submit" disabled={busy}>{busy ? t("保存中…") : t("保存子集")}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
