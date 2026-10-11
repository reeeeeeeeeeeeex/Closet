import { Native } from "./native";
import { read,readDocument,updateDocument,currentReplica,type RootState } from "./store";
import { canonical,emptyReplica,mergeReplicas,normalizeReplica,recordEqual,validateReplica,type Replica,type MergeResult,type Resolution } from "../lib/sync-model";
export type RemoteState={protocolVersion:1;serverId:string;revision:string;replica:Replica};
type Commit={protocolVersion:1;serverId:string;requestId:string;expectedRevision:string;replica:Replica};
type Pending={input:Commit;source:Replica;previousBase:Replica;merge:MergeResult};
export type SyncBinding={url:string;serverId:string;owner:string;token:string;id:string;base:Replica;lastSync?:string;pending?:Pending;conflicts?:MergeResult["conflicts"]};
class NetworkError extends Error{constructor(public status:number,message:string){super(message)}}
async function remote<T>(url:string,path:string,method='GET',token?:string,body?:unknown):Promise<T>{
  const response=await Native.http({url:url+path,method,token,body:body===undefined?undefined:JSON.stringify(body)});
  let data;try{data=JSON.parse(response.body);}catch{throw Error('电脑返回了无法识别的响应，请检查地址和版本');}
  if(response.status<200||response.status>=300)throw new NetworkError(response.status,data.error||'同步请求失败');return data;
}
export async function pair(owner:string,address:string,code:string){
  const parsed=new URL(address.includes('://')?address:`http://${address}`);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('请输入电脑服务地址，例如 http://192.168.1.10:4320');
  if((await readDocument(owner)).value.binding)throw Error('此账号已配对，请先解除配对');
  const root=(await read<RootState>('root')).value!;
  const result=await remote<Omit<SyncBinding,'url'|'base'>>(parsed.origin,'/api/sync/pair','POST',undefined,{protocolVersion:1,code:code.trim(),deviceId:root.deviceId,name:`Android · ${root.profiles.find(p=>p.id===owner)?.name||'我'}`});
  await updateDocument(owner,doc=>{doc.binding={...result,url:parsed.origin,base:emptyReplica()};});
}
export async function unpair(owner:string){await updateDocument(owner,doc=>{delete doc.binding;});}
const inFlight=new Map<string,Promise<void>>();
export function synchronize(owner:string,progress:(message:string)=>void,resolutions:Record<string,Resolution>={}){
  const existing=inFlight.get(owner);if(existing)return existing;
  const promise=syncWork(owner,progress,resolutions).finally(()=>{inFlight.delete(owner);window.dispatchEvent(new Event('closet-local-change'));});inFlight.set(owner,promise);window.dispatchEvent(new Event('closet-local-change'));return promise;
}
function reconcileAcknowledgement(merge:MergeResult,ack:Replica){
  for(const c of merge.base.collections){const remote=ack.collections.find(r=>r.id===c.id);if(!remote)continue;
    c.records=c.records.map(r=>remote.records.find(a=>recordEqual(a,r))||r);
    const local=merge.local.collections.find(l=>l.id===c.id);if(local)local.records=local.records.map(r=>c.records.find(b=>recordEqual(b,r))||r);
  }
}
async function finish(owner:string,binding:SyncBinding,pending:Pending,ack:RemoteState){
  if(ack.serverId!==binding.serverId||ack.protocolVersion!==1)throw Error('电脑身份或同步协议已改变');
  validateReplica(ack.replica);reconcileAcknowledgement(pending.merge,ack.replica);
  await updateDocument(owner,doc=>{
    if(doc.binding?.id!==binding.id)throw Error('同步配对已改变');
    const rebase=mergeReplicas(pending.source,normalizeReplica(doc.replica),pending.merge.local);
    const baseline=pending.merge.base;
    // Edits saved while the network request was running win locally, but remain a conflict remotely.
    for(const conflict of rebase.conflicts){const c=baseline.collections.find(c=>c.id===conflict.collectionId),old=pending.previousBase.collections.find(c=>c.id===conflict.collectionId);if(c)c.records=[...c.records.filter(r=>!conflict.ids.includes(r.id)),...(old?.records.filter(r=>conflict.ids.includes(r.id))||[])];}
    // Retain unreferenced local uploads until their draft is saved.
    rebase.local.assets=[...new Map([...doc.replica.assets,...rebase.local.assets].map(a=>[a.hash,a])).values()];
    doc.replica=rebase.local;doc.binding.base=baseline;doc.binding.lastSync=new Date().toISOString();delete doc.binding.pending;
    doc.binding.conflicts=mergeReplicas(baseline,normalizeReplica(doc.replica),ack.replica).conflicts;
  });
}
async function syncWork(owner:string,progress:(message:string)=>void,resolutions:Record<string,Resolution>){
  for(let attempt=0;attempt<3;attempt++){
    let document=(await readDocument(owner)).value;const binding=document.binding;if(!binding)throw Error('请先与电脑配对');
    if(binding.pending){
      progress('确认上次同步提交…');
      try{const ack=await remote<RemoteState>(binding.url,'/api/sync/commit','POST',binding.token,binding.pending.input);await finish(owner,binding,binding.pending,ack);}
      catch(e){if(e instanceof NetworkError&&e.status===409){await updateDocument(owner,d=>{if(d.binding?.id===binding.id)delete d.binding.pending;});}else throw e;}
      document=(await readDocument(owner)).value;
    }
    progress('读取电脑衣橱…');
    const state=await remote<RemoteState>(binding.url,'/api/sync/state','GET',binding.token);
    if(state.protocolVersion!==1||state.serverId!==binding.serverId)throw Error('电脑身份或同步协议已改变，请重新配对');
    state.replica=validateReplica(state.replica);
    await updateDocument(owner,doc=>{
      const b=doc.binding!;
      if(!b.base.collections.length&&doc.replica.collections.length===1&&!doc.replica.collections[0].records.length&&state.replica.collections.length){const c=state.replica.collections[0];doc.replica.collections=[{...c,records:[]}];}
    });
    document=(await readDocument(owner)).value;
    const source=normalizeReplica(document.replica),base=document.binding!.base,merge=mergeReplicas(base,source,state.replica,resolutions);
    const localAssets=new Set(document.replica.assets.map(a=>a.hash)),remoteAssets=new Set(state.replica.assets.map(a=>a.hash));
    // Download conflict photos too, so either version can be reviewed offline.
    for(const [index,asset] of state.replica.assets.entries())if(!localAssets.has(asset.hash)){progress(`下载原图 ${index+1} / ${state.replica.assets.length}`);await Native.transfer({url:`${binding.url}/api/sync/assets/${asset.hash}`,token:binding.token,owner,asset,direction:'download'});}
    await updateDocument(owner,doc=>{doc.replica.assets=[...new Map([...doc.replica.assets,...state.replica.assets].map(a=>[a.hash,a])).values()];});
    for(const [index,asset] of merge.remote.assets.entries())if(!remoteAssets.has(asset.hash)){progress(`上传原图 ${index+1} / ${merge.remote.assets.length}`);await Native.transfer({url:`${binding.url}/api/sync/assets/${asset.hash}`,token:binding.token,owner,asset,direction:'upload'});}
    const pending:Pending={source,previousBase:base,merge,input:{protocolVersion:1,serverId:binding.serverId,requestId:crypto.randomUUID(),expectedRevision:state.revision,replica:merge.remote}};
    await updateDocument(owner,doc=>{if(doc.binding?.id!==binding.id)throw Error('同步配对已改变');doc.binding.pending=pending;});
    try{progress('提交并确认同步…');const ack=await remote<RemoteState>(binding.url,'/api/sync/commit','POST',binding.token,pending.input);await finish(owner,binding,pending,ack);progress('');return;}
    catch(e){if(e instanceof NetworkError&&e.status===409){await updateDocument(owner,d=>{if(d.binding?.id===binding.id)delete d.binding.pending;});continue;}throw e;}
  }
  throw Error('电脑资料持续变化，本地数据已保留，请稍后再次同步');
}
export async function syncStatus(owner:string){const doc=(await readDocument(owner)).value;const b=doc.binding;return {binding:b,syncing:inFlight.has(owner),dirty:b?canonical(normalizeReplica(doc.replica))!==canonical(normalizeReplica(b.base)):false};}
export { currentReplica };
