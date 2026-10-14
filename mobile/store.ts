import { Capacitor } from "@capacitor/core";
import { Native } from "./native";
import { type Replica, emptyReplica, normalizeReplica } from "../lib/sync-model";
import type { Profile } from "../lib/profile-types";
import type { SyncBinding } from "./sync";
import type { ToolActivity } from "../lib/ai-types";
export type RootState = { version:1;deviceId:string;profiles:Profile[];current:string };
export type LocalDocument = { version:1;replica:Replica;binding?:SyncBinding;aiActivity?:ToolActivity[];aiReceipts?:{collectionId:string;requestId:string;hash:string;result:Record<string,unknown>}[] };
let tail:Promise<unknown>=Promise.resolve();
export function locked<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work,work);tail=next.catch(()=>{});return next;}
export async function read<T>(key:string){const data=await Native.read({key});return {revision:data.revision,value:data.value?JSON.parse(data.value) as T:null,filesRoot:data.filesRoot};}
export async function write<T>(key:string,expected:number,value:T){return Native.write({key,expected,value:JSON.stringify(value)});}
export const documentKey=(owner:string)=>`profile:${owner}`;
export async function readDocument(owner:string){const data=await read<LocalDocument>(documentKey(owner));if(!data.value)throw Error("账号资料不存在");if(data.value.version!==1)throw Error('此资料需要更新版本的 App，请先升级');return {...data,value:data.value};}
export async function updateDocument<T>(owner:string,work:(doc:LocalDocument)=>T|Promise<T>):Promise<T>{return locked(async()=>{const current=await readDocument(owner);const result=await work(current.value);await write(documentKey(owner),current.revision,current.value);window.dispatchEvent(new Event("closet-local-change"));return result;});}
export function newDocument():LocalDocument{return {version:1,replica:{...emptyReplica(),collections:[{id:crypto.randomUUID(),name:"我的衣橱",createdAt:new Date().toISOString(),records:[]}]}};}
export let filesRoot="";
export const localAssetUrl=(hash:string,owner:string)=>Capacitor.convertFileSrc(`${filesRoot}/media/${owner}/${hash}`);
export async function bootstrap(){return locked(async()=>{
  const current=await read<RootState>("root");filesRoot=current.filesRoot;
  if(current.value){if(current.value.version!==1)throw Error('此资料需要更新版本的 App，请先升级');return current.value;}
  const profile={id:crypto.randomUUID(),name:"我"},root:RootState={version:1,deviceId:crypto.randomUUID(),profiles:[profile],current:profile.id};
  await write(documentKey(profile.id),0,newDocument());await write("root",current.revision,root);return root;
});}
export async function currentReplica(owner:string){return normalizeReplica((await readDocument(owner)).value.replica);}
