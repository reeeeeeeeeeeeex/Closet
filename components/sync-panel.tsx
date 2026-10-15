"use client";
import { useCallback,useEffect,useState } from "react";
import { api } from "@/lib/portable";
import { withProfileActivity } from "@/lib/profile-client";
import { getSyncClient,type SyncStatus } from "@/lib/sync-client";
import type { Resolution } from "@/lib/sync-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";
import { SyncConflictRecords } from "@/components/sync-conflict-records";
type Device={id:string;name:string;createdAt:string};
export function SyncPanel({owner,onChanged}:{owner:string;onChanged:()=>void|Promise<void>}){
  const {t,locale}=useI18n(),mobile=getSyncClient();const [status,setStatus]=useState<SyncStatus|null>(null),[devices,setDevices]=useState<Device[]>([]),[address,setAddress]=useState(''),[code,setCode]=useState(''),[expires,setExpires]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
  const refresh=useCallback(async()=>{if(mobile)setStatus(await mobile.status(owner));else setDevices((await api<{devices:Device[]}>('/api/sync/pairing')).devices);},[mobile,owner]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh().catch(e=>setError(String(e.message))),0);return ()=>clearTimeout(timer);},[refresh]);
  const work=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await withProfileActivity(action);await refresh();await onChanged();}catch(e){setError(e instanceof Error?e.message:String(e));await refresh().catch(()=>{});}finally{setBusy(false);setProgress('');}};
  const sync=(resolutions?:Record<string,Resolution>)=>work(()=>mobile!.sync(owner,setProgress,resolutions));
  return <section className="backup-card sync-panel"><h2>{t('局域网同步')}</h2>
    {mobile?<>
      <p>{t('所有资料先保存到手机。电脑可连接时，手动同步此账号的全部衣橱。')}</p>
      {status?.paired?<><p>{status.url}</p><p>{status.conflicts.length?t('存在冲突，其他资料已同步'):status.dirty?t('有待同步的本地修改'):t('本地资料已与电脑同步')}{status.lastSync&&` · ${new Date(status.lastSync).toLocaleString(locale)}`}</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void sync()}>{status.pending?t('重试并确认上次同步'):t('立即双向同步')}</Button><Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm(t('解除配对后，本机资料保留；未确认的同步将在下次配对时重新核对。电脑上的设备授权可在电脑端撤销。')))void work(()=>mobile.unpair(owner));}}>{t('解除配对')}</Button></div></>:<><label>{t('电脑地址')}<Input value={address} onChange={e=>setAddress(e.target.value)} placeholder="http://192.168.1.10:4320" disabled={busy}/></label><label>{t('电脑显示的配对码')}<Input value={code} onChange={e=>setCode(e.target.value)} autoCapitalize="characters" disabled={busy}/></label><Button disabled={busy||!address||!code} onClick={()=>void work(async()=>{await mobile.pair(owner,address,code);await mobile.sync(owner,setProgress);})}>{t('配对并同步')}</Button><p>{t('首次同步时，双方已有资料保留为两个衣橱；空手机衣橱直接接入电脑衣橱。')}</p></>}
      {status?.conflicts.map(conflict=><div className="sync-conflict" key={conflict.key}><h3>{conflict.collectionName} · {t('修改冲突')}</h3><p>{t('关联的分组、单品、搭配和日历将一起处理。稍后处理会保留双方版本。')}</p><div className="sync-versions">{(['local','remote'] as const).map(side=><details key={side}><summary>{side==='local'?t('手机版本'):t('电脑版本')} · {t('{count} 条记录',{count:conflict[side].length})}</summary><SyncConflictRecords records={conflict[side]} owner={owner}/></details>)}</div><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void sync({[conflict.key]:{choice:'local',signature:conflict.signature}})}>{t('保留手机版本')}</Button><Button variant="outline" disabled={busy} onClick={()=>void sync({[conflict.key]:{choice:'remote',signature:conflict.signature}})}>{t('保留电脑版本')}</Button><span>{t('暂不选择即可稍后处理')}</span></div></div>)}
    </>:<><p>{t('先以局域网模式启动电脑服务，在手机 App 中填写电脑地址和这里的配对码。配对仅授权当前账号。')}</p><Button disabled={busy} onClick={()=>void work(async()=>{const result=await api<{code:string;expires:number}>('/api/sync/pairing',{method:'POST'});setCode(result.code);setExpires(new Date(result.expires).toLocaleTimeString(locale));})}>{t('生成配对码')}</Button>{code&&<p><strong className="pairing-code">{code}</strong> · {t('有效至')} {expires}</p>}{devices.map(d=><div className="sync-device" key={d.id}><span>{d.name}</span><Button variant="outline" disabled={busy} onClick={()=>void work(async()=>{await api('/api/sync/pairing',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.id})});})}>{t('撤销授权')}</Button></div>)}</>}
    {progress&&<p role="status">{t(progress)}</p>}{error&&<p role="alert" className="text-red-700">{t(error)}</p>}
  </section>;
}
