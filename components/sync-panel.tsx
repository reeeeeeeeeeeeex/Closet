"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Laptop, RefreshCw, Smartphone, Unlink } from "lucide-react";
import { api } from "@/lib/portable";
import { withProfileActivity } from "@/lib/profile-client";
import { getSyncClient, type SyncStatus } from "@/lib/sync-client";
import type { Resolution } from "@/lib/sync-model";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/provider";
import { SyncConflictRecords } from "@/components/sync-conflict-records";

type Device = { id: string; name: string; createdAt: string };

export function SyncPanel({ owner, onChanged }: { owner: string; onChanged: () => void | Promise<void> }) {
  const { t, locale } = useI18n(), mobile = getSyncClient();
  const [status, setStatus] = useState<SyncStatus | null>(null), [devices, setDevices] = useState<Device[]>([]), [address, setAddress] = useState(""), [code, setCode] = useState(""), [expires, setExpires] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState("");
  const refresh = useCallback(async () => { if (mobile) setStatus(await mobile.status(owner)); else setDevices((await api<{ devices: Device[] }>("/api/sync/pairing")).devices); }, [mobile, owner]);
  useEffect(() => { const timer = setTimeout(() => void refresh().catch(e => setError(String(e.message))), 0); return () => clearTimeout(timer); }, [refresh]);
  const work = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await withProfileActivity(action); await refresh(); await onChanged(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); await refresh().catch(() => {}); } finally { setBusy(false); setProgress(""); } };
  const sync = (resolutions?: Record<string, Resolution>) => work(() => mobile!.sync(owner, setProgress, resolutions));
  const statusTone = status?.conflicts.length ? "is-conflict" : status?.dirty || status?.pending ? "is-dirty" : "is-synced";

  return <section className="backup-card sync-panel">
    <div className="backup-card-head">
      <span className="apple-section-icon tone-blue" aria-hidden="true"><RefreshCw size={18}/></span>
      <div className="backup-card-title">
        <h2>{t("局域网同步")}</h2>
        {mobile && status?.paired && (
          <span className={`sync-pill ${statusTone}`}>
            <i aria-hidden="true"/>
            {status.conflicts.length ? t("存在冲突，其他资料已同步") : status.dirty ? t("有待同步的本地修改") : t("本地资料已与电脑同步")}
          </span>
        )}
      </div>
    </div>

    {mobile ? <>
      <p className="sync-lead">{t("所有资料先保存到手机。电脑可连接时，手动同步此账号的全部衣橱。")}</p>
      {status?.paired ? <>
        <div className="sync-paired-card">
          <div className="sync-paired-row">
            <Laptop size={15} aria-hidden="true"/>
            <span>{status.url}</span>
          </div>
          {status.lastSync && <small className="sync-paired-time">{new Date(status.lastSync).toLocaleString(locale)}</small>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void sync()}>
            <RefreshCw size={15} className={busy ? "animate-spin" : ""}/>
            {status.pending ? t("重试并确认上次同步") : t("立即双向同步")}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy}><Unlink size={15}/>{t("解除配对")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="closet-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>{t("解除配对？")}</AlertDialogTitle>
                <AlertDialogDescription>{t("解除配对后，本机资料保留；未确认的同步将在下次配对时重新核对。电脑上的设备授权可在电脑端撤销。")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void work(() => mobile.unpair(owner))}>{t("解除配对")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </> : <>
        <div className="sync-pair-fields">
          <div className="field">
            <Label htmlFor="sync-pair-address">{t("电脑地址")}</Label>
            <Input id="sync-pair-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="http://192.168.1.10:4320" disabled={busy}/>
          </div>
          <div className="field">
            <Label htmlFor="sync-pair-code">{t("电脑显示的配对码")}</Label>
            <Input id="sync-pair-code" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" disabled={busy}/>
          </div>
        </div>
        <Button disabled={busy || !address || !code} onClick={() => void work(async () => { await mobile.pair(owner, address, code); await mobile.sync(owner, setProgress); })}>{t("配对并同步")}</Button>
        <p className="field-hint">{t("首次同步时，双方已有资料保留为两个衣橱；空手机衣橱直接接入电脑衣橱。")}</p>
      </>}
      {status?.conflicts.map(conflict => <div className="sync-conflict" key={conflict.key}>
        <div className="sync-conflict-head">
          <AlertTriangle size={17} aria-hidden="true"/>
          <h3>{conflict.collectionName} · {t("修改冲突")}</h3>
        </div>
        <p>{t("关联的分组、单品、搭配和日历将一起处理。稍后处理会保留双方版本。")}</p>
        <div className="sync-versions">
          {(["local", "remote"] as const).map(side => <details className="sync-version-card" key={side}>
            <summary>{side === "local" ? t("手机版本") : t("电脑版本")} · {t("{count} 条记录", { count: conflict[side].length })}<ChevronRight size={15} aria-hidden="true"/></summary>
            <SyncConflictRecords records={conflict[side]} owner={owner}/>
          </details>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => void sync({ [conflict.key]: { choice: "local", signature: conflict.signature } })}>{t("保留手机版本")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void sync({ [conflict.key]: { choice: "remote", signature: conflict.signature } })}>{t("保留电脑版本")}</Button>
          <span className="sync-conflict-later">{t("暂不选择即可稍后处理")}</span>
        </div>
      </div>)}
    </> : <>
      <p className="sync-lead">{t("先以局域网模式启动电脑服务，在手机 App 中填写电脑地址和这里的配对码。配对仅授权当前账号。")}</p>
      <div className="sync-desktop-actions">
        <Button disabled={busy} onClick={() => void work(async () => { const result = await api<{ code: string; expires: number }>("/api/sync/pairing", { method: "POST" }); setCode(result.code); setExpires(new Date(result.expires).toLocaleTimeString(locale)); })}>{t("生成配对码")}</Button>
        {code && <div className="pairing-code-banner"><strong className="pairing-code">{code}</strong><span>{t("有效至")} {expires}</span></div>}
      </div>
      {!!devices.length && <div className="sync-device-list">{devices.map(d => <div className="sync-device" key={d.id}>
        <span className="sync-device-name"><Smartphone size={15} aria-hidden="true"/>{d.name}</span>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void work(async () => { await api("/api/sync/pairing", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id }) }); })}>{t("撤销授权")}</Button>
      </div>)}</div>}
    </>}
    {progress && <p className="sync-progress" role="status">{t(progress)}</p>}
    {error && <p role="alert" className="form-error">{t(error)}</p>}
  </section>;
}
