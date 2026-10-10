"use client";
import { useId, useState } from "react";
import { ZodError } from "zod";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ShoeSizeFields } from "@/components/shoe-size-fields";
import { personalSizesSchema, type ClosetState, type PersonalSizes, type PersonalSizesRecord } from "@/lib/domain";
import { PERSONAL_MEASUREMENTS, type PersonalMeasurement } from "@/lib/personal-sizes";
import { tr } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";

export function PersonalSizesPanel({ record, collectionName, disabled, onSave, onRefresh }: {
  record?: PersonalSizesRecord; collectionName: string; disabled: boolean;
  onSave: (data: PersonalSizes, base?: PersonalSizesRecord) => Promise<PersonalSizesRecord>; onRefresh: () => Promise<ClosetState | undefined>;
}) {
  const { t } = useI18n(); const id = useId();
  const [base, setBase] = useState(record);
  const [data, setData] = useState<PersonalSizes>(() => structuredClone(record?.data || personalSizesSchema.parse({})));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const changedElsewhere = record?.version !== base?.version || record?.id !== base?.id;
  function change(next: PersonalSizes) { setData(next); setSaved(false); }
  function fields(keys: PersonalMeasurement[]) {
    return <div className="measurement-grid">{keys.map(key => <div className="field" key={key}><Label htmlFor={`${id}-${key}`}>{t(PERSONAL_MEASUREMENTS[key][0])}</Label><Input id={`${id}-${key}`} type="number" inputMode="decimal" min={0.1} max={500} step="any" placeholder={t("未填写")} value={data.measurements[key] ?? ""} aria-describedby={`${id}-${key}-guide`} onChange={event => {
      const measurements = { ...data.measurements }; if (event.target.value === "") delete measurements[key]; else measurements[key] = Number(event.target.value); change({ ...data, measurements });
    }}/><small className="field-hint" id={`${id}-${key}-guide`}>{t(PERSONAL_MEASUREMENTS[key][1])}</small></div>)}</div>;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try { const result = await onSave(personalSizesSchema.parse(data), base); setBase(result); setData(structuredClone(result.data)); setSaved(true); }
    catch (error) { setError(error instanceof ZodError ? tr(error.issues[0]?.message || "保存尺码失败，请重试") : error instanceof Error ? tr(error.message) : t("保存尺码失败，请重试")); await onRefresh(); }
    finally { setBusy(false); }
  }
  return <form className="personal-sizes-panel" onSubmit={event => void submit(event)}>
    <p className="personal-sizes-context">{t("当前衣橱：{name}", { name: collectionName })}</p><p className="field-hint">{t("记录身体尺寸，单位为 cm。所有项目可留空，围度填写一整圈。")}</p>
    {changedElsewhere && <p className="form-error" role="status">{t("其他设备已更新尺码，当前草稿仍保留。请载入最新尺码后重新确认。")}</p>}
    <fieldset disabled={busy || disabled} className="personal-sizes-grid"><section className="personal-sizes-card"><h2>{t("身体尺寸（cm）")}</h2>{fields(["height", "shoulderWidth", "chest", "waist", "hips"])}</section><section className="personal-sizes-card"><h2>{t("四肢尺寸（cm）")}</h2>{fields(["thigh", "knee", "armLength", "inseam", "outseam", "footLength"])}</section><section className="personal-sizes-card"><h2>{t("我的鞋码")}</h2><ShoeSizeFields value={data.shoeSize} onChange={shoeSize => change({ ...data, shoeSize })}/><p className="field-hint">{t("欧码和中国毫米码分别填写，不自动换算；可参考经常穿的鞋标。")}</p></section></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="personal-sizes-actions"><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={busy || disabled}><RefreshCw size={16}/>{t("载入最新尺码")}</Button></AlertDialogTrigger><AlertDialogContent className="closet-dialog"><AlertDialogHeader><AlertDialogTitle>{t("载入最新尺码？")}</AlertDialogTitle><AlertDialogDescription>{t("这会替换当前未保存的草稿。已保存的尺码资料保留。")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("取消")}</AlertDialogCancel><AlertDialogAction onClick={async () => { setBusy(true); try { const state = await onRefresh(); if (!state?.records) return; const latest = state.records.find(value => value.kind === "personalSizes"); setBase(latest); setData(structuredClone(latest?.data || personalSizesSchema.parse({}))); setError(""); setSaved(false); } finally { setBusy(false); } }}>{t("载入最新尺码")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Button type="submit" disabled={busy || disabled}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} {busy ? t("保存中…") : t("保存我的尺码")}</Button>{saved && <span role="status">{t("尺码已保存")}</span>}</div>
  </form>;
}
