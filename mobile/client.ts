import { z } from "zod";
import { Native } from "./native";
import { read,write,locked,readDocument,updateDocument,documentKey,newDocument,localAssetUrl,type RootState } from "./store";
import type { ClosetClient } from "../lib/closet-client";
import { validateArchive, referencedAssets, type ClosetState, type Asset } from "../lib/domain";
import { mutateRecords, MutationError } from "../lib/mutations";
import { colorKey,isCommonColor,itemColorStyle,type LibraryColor } from "../lib/colors";
import { getProfileContext } from "../lib/profile-client";
import { manifestFromState } from "../lib/portable";
import { phoneAiRequest } from "./ai";
import { McpToolError } from "../lib/mcp-core";
const nameSchema=z.string().trim().min(1,"请填写账号名称").max(100,"账号名称不能超过 100 个字符");
export function mergeColors(colors:LibraryColor[], additions:LibraryColor[]){const map=new Map(colors.map(c=>[colorKey(c),c]));for(const c of additions){if(isCommonColor(c))continue;const old=map.get(colorKey(c));if(!old||c.usedAt>old.usedAt)map.set(colorKey(c),c);}return [...map.values()];}
export const androidClient:ClosetClient={
  assetUrl:(hash,owner)=>localAssetUrl(hash,owner||""),
  async request(path,init={}){
    try{
      const url=new URL(path,"https://localhost"),method=init.method||"GET",body=typeof init.body==='string'?JSON.parse(init.body):undefined;
      const root=(await read<RootState>("root")).value!;
      if(url.pathname==='/api/profiles'){
        if(method==='GET')return Response.json({profiles:root.profiles,current:root.profiles.find(p=>p.id===root.current)});
        const profile=await locked(async()=>{
          const r=await read<RootState>('root'),data=r.value!;let selected;
          if(method==='PATCH'){
            const name=nameSchema.parse(body.name);selected=data.profiles.find(p=>p.id===body.id);if(!selected)throw new MutationError(404,'账号不存在');
            if(data.profiles.some(p=>p.id!==selected!.id&&p.name.toLowerCase()===name.toLowerCase()))throw new MutationError(409,'此账号名称已存在，请换一个名称');selected.name=name;
          }else if(body.action==='create'){
            const name=nameSchema.parse(body.name);if(data.profiles.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw new MutationError(409,'此账号名称已存在，请换一个名称');
            selected={id:crypto.randomUUID(),name};await write(documentKey(selected.id),0,newDocument());data.profiles.push(selected);data.current=selected.id;
          }else{selected=data.profiles.find(p=>p.id===body.id);if(!selected)throw new MutationError(404,'账号不存在');data.current=selected.id;}
          await write('root',r.revision,data);return selected;
        });return Response.json({profile});
      }
      const owner=new Headers(init.headers).get('X-Closet-Profile')||getProfileContext();
      if(!owner||owner!==root.current)return Response.json({error:'账号已切换，请重新载入',code:'PROFILE_CHANGED'},{status:409});
      if(url.pathname.startsWith('/api/ai/')||url.pathname==='/api/mcp/connections')return await phoneAiRequest(owner,url.pathname,method,body,init.signal||undefined);
      if(url.pathname!=='/api/closet')throw new MutationError(404,'本地接口不存在');
      if(method==='GET'){
        const replica=(await readDocument(owner)).value.replica;
        const collection=replica.collections.find(c=>c.id===(url.searchParams.get('collection')||replica.collections[0]?.id));if(!collection)throw new MutationError(404,'衣橱不存在');
        const hashes=referencedAssets(collection.records);
        return Response.json({profile:root.profiles.find(p=>p.id===owner),collections:replica.collections.map(({id,name,createdAt})=>({id,name,createdAt})),collectionId:collection.id,records:collection.records,assets:replica.assets.filter(a=>hashes.has(a.hash)),colorLibrary:replica.colorLibrary} satisfies ClosetState);
      }
      const result=await updateDocument(owner,doc=>{
        if(method==='PUT'){
          const archive=validateArchive(body),collectionId=crypto.randomUUID();
          for(const a of archive.assets)if(!doc.replica.assets.some(b=>b.hash===a.hash&&b.size===a.size&&b.mime===a.mime))throw Error('备份原图缺失');
          doc.replica.collections.push({id:collectionId,name:archive.collection.name.slice(0,94)+' · 导入',createdAt:new Date().toISOString(),records:archive.records});
          doc.replica.colorLibrary=mergeColors(doc.replica.colorLibrary,archive.colorLibrary);return {ok:true,collectionId};
        }
        const c=doc.replica.collections.find(c=>c.id===body.collectionId);if(!c)throw new MutationError(404,'衣橱不存在');
        const next=mutateRecords(c.records,body,doc.replica.assets);
        doc.replica.tombstones ||= [];
        for(const old of c.records)if(!next.records.some(r=>r.id===old.id))doc.replica.tombstones.push({collectionId:c.id,id:old.id,deletedAt:new Date().toISOString()});
        c.records=next.records;
        const additions=c.records.flatMap(r=>r.kind==='item'?itemColorStyle(r.data).values.map(v=>({...v,usedAt:r.updatedAt})):[]);
        doc.replica.colorLibrary=mergeColors(doc.replica.colorLibrary,additions);return next.result;
      });return Response.json(result);
    }catch(e){return Response.json({error:e instanceof z.ZodError?e.issues[0]?.message:e instanceof Error?e.message:'操作失败',...(e instanceof McpToolError && e.status===409 ? {code:'PROFILE_CHANGED'} : {})},{status:e instanceof MutationError||e instanceof McpToolError?e.status:400});}
  },
  async uploadAsset(file,owner){
    if(file.size>20*1024*1024||!file.size)throw Error('单张图片最多 20 MB，且不能为空');
    const {handle}=await Native.beginFile({owner});
    for(let offset=0;offset<file.size;offset+=192*1024){const bytes=new Uint8Array(await file.slice(offset,offset+192*1024).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);await Native.appendFile({handle,data:btoa(binary)});}
    const {asset}=await Native.finishFile({handle,owner,name:file.name});
    await updateDocument(owner,doc=>{if(!doc.replica.assets.some(a=>a.hash===asset.hash))doc.replica.assets.push(asset);});return asset;
  },
  async exportArchive(state){const result=await Native.exportArchive({owner:state.profile!.id,manifest:manifestFromState(state),filename:`new-closet-${new Date().toISOString().slice(0,10)}.zip`});if(!result.saved)throw Error('已取消保存备份');},
  async pickArchive(){const result=await Native.pickArchive();if(result.cancelled)return null;return {handle:result.handle,manifest:validateArchive(result.manifest)};},
  async importArchive(handle,manifest,owner){
    const archive=validateArchive(manifest);await Native.importStaged({handle,owner});
    return updateDocument(owner,doc=>{for(const a of archive.assets)if(!doc.replica.assets.some(b=>b.hash===a.hash))doc.replica.assets.push(a);
      const id=crypto.randomUUID();doc.replica.collections.push({id,name:archive.collection.name.slice(0,94)+' · 导入',createdAt:new Date().toISOString(),records:archive.records});
      doc.replica.colorLibrary=mergeColors(doc.replica.colorLibrary,[...archive.colorLibrary,...archive.records.flatMap(r=>r.kind==='item'?itemColorStyle(r.data).values.map(v=>({...v,usedAt:r.updatedAt})):[])]);return id;});
  },
  async saveAsset(hash,owner){const asset=(await readDocument(owner)).value.replica.assets.find(a=>a.hash===hash) as Asset;const result=await Native.saveAsset({owner,asset});if(!result.saved)throw Error('已取消保存原图');},
};
