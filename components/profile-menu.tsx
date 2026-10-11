"use client";
import { useState } from "react";
import { Check, ChevronUp, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { api } from "@/lib/portable";
import { getOperationCount } from "@/lib/profile-client";
import type { Profile, ProfileState } from "@/lib/profile-types";
import { useI18n } from "@/lib/i18n/provider";

type Task = { action: "select"; id: string } | { action: "create"; name: string };
export function ProfileMenu({ current, disabled, hasDraft, onSelected, onRenamed }: {
  current: Profile; disabled: boolean; hasDraft: boolean;
  onSelected: (profile: Profile) => void; onRenamed: (profile: Profile) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState(current.id);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id?: string } | null>(null), [name, setName] = useState("");
  const [pending, setPending] = useState<Task | null>(null);
  async function load() {
    setLoading(true); setError("");
    try { const state = await api<ProfileState>("/api/profiles"); setProfiles(state.profiles); setSelectedId(state.current.id); const renamed = state.profiles.find(profile => profile.id === current.id); if (renamed) onRenamed(renamed); }
    catch (error) { setError(error instanceof Error ? error.message : t("账号列表读取失败，请重试")); }
    finally { setLoading(false); }
  }
  async function perform(task: Task) {
    if (disabled || getOperationCount()) { setError(t("正在保存或处理备份，请完成后再切换账号。")); return; }
    setBusy(true); setError("");
    try { const result = await api<{ profile: Profile }>("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) }); setPending(null); onSelected(result.profile); }
    catch (error) { setError(error instanceof Error ? error.message : t("账号操作失败，请重试")); }
    finally { setBusy(false); }
  }
  function select(task: Task) { if (hasDraft) { setOpen(false); setPending(task); } else void perform(task); }
  async function saveName(event: React.FormEvent) {
    event.preventDefault(); const trimmed = name.trim();
    if (!trimmed) { setError(t("请填写账号名称")); return; }
    if (!editing?.id) { select({ action: "create", name: trimmed }); return; }
    setBusy(true); setError("");
    try { const result = await api<{ profile: Profile }>("/api/profiles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, name: trimmed }) }); setProfiles(previous => previous.map(profile => profile.id === result.profile.id ? result.profile : profile)); onRenamed(result.profile); setEditing(null); }
    catch (error) { setError(error instanceof Error ? error.message : t("账号操作失败，请重试")); }
    finally { setBusy(false); }
  }
  return <>
    <Popover open={open} onOpenChange={value => { setOpen(value); if (value) void load(); }}><PopoverTrigger asChild><button className="profile-switch" type="button" disabled={disabled || busy} aria-label={t("管理和切换账号")}><div className="profile-mark">{Array.from(current.name)[0]}</div><div><strong title={current.name}>{current.name}</strong><span>{t("切换账号")}</span></div><ChevronUp size={15}/></button></PopoverTrigger>
      <PopoverContent side="top" align="start" collisionPadding={12} className="profile-menu" aria-label={t("账号列表")}>
        {loading ? <p className="field-hint">{t("正在读取账号…")}</p> : <div className="profile-list">{profiles.map(profile => <div className="profile-row" key={profile.id}><button type="button" className="profile-choice" disabled={busy || disabled} onClick={() => select({ action: "select", id: profile.id })} aria-label={t("切换到 {name}", { name: profile.name })} aria-current={selectedId === profile.id ? "true" : undefined}><span className="profile-mini-mark">{Array.from(profile.name)[0]}</span><span>{profile.name}</span>{selectedId === profile.id && <Check size={15}/>}</button><Button type="button" variant="ghost" size="icon" disabled={busy || disabled} aria-label={t("修改 {name} 的名称", { name: profile.name })} onClick={() => { setOpen(false); setError(""); setName(profile.name); setEditing({ id: profile.id }); }}><Pencil size={14}/></Button></div>)}</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="button" variant="ghost" className="profile-create" disabled={busy || disabled} onClick={() => { setOpen(false); setError(""); setName(""); setEditing({}); }}><Plus size={16}/>{t("新增账号")}</Button>
      </PopoverContent>
    </Popover>
    <Dialog open={editing !== null} onOpenChange={value => { if (!value && !busy) setEditing(null); }}><DialogContent className="closet-dialog profile-name-dialog"><DialogHeader><DialogTitle>{editing?.id ? t("修改账号名称") : t("新增账号")}</DialogTitle><DialogDescription>{editing?.id ? t("修改名称不会改变这个账号的衣橱资料。") : t("填写名称即可创建，不需要密码。")}</DialogDescription></DialogHeader><form className="profile-name-form" onSubmit={event => void saveName(event)}><Label htmlFor="profile-name">{t("账号名称")}</Label><Input id="profile-name" value={name} required autoFocus maxLength={100} disabled={busy || disabled} onChange={event => setName(event.target.value)}/>{error && <p className="form-error" role="alert">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>{t("取消")}</Button><Button type="submit" disabled={busy || disabled}>{busy && <Loader2 size={15} className="animate-spin"/>}{editing?.id ? t("保存名称") : t("创建并切换")}</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={pending !== null} onOpenChange={value => { if (!value && !busy) setPending(null); }}><AlertDialogContent className="closet-dialog"><AlertDialogHeader><AlertDialogTitle>{t("切换账号前放弃草稿？")}</AlertDialogTitle><AlertDialogDescription>{t("当前页面有未保存的内容。切换后会放弃这些草稿，已保存的资料保留。")}</AlertDialogDescription></AlertDialogHeader>{error && <p className="form-error" role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("保留草稿")}</AlertDialogCancel><AlertDialogAction disabled={busy || disabled} onClick={event => { event.preventDefault(); if (pending) void perform(pending); }}>{t("放弃草稿并切换")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
