import type { Resolution,SyncConflict } from "./sync-model";
export type SyncStatus={paired:boolean;url?:string;lastSync?:string;dirty:boolean;conflicts:SyncConflict[];pending?:boolean;syncing?:boolean};
export interface MobileSyncClient {
  status(owner:string):Promise<SyncStatus>;
  pair(owner:string,address:string,code:string):Promise<void>;
  unpair(owner:string):Promise<void>;
  sync(owner:string,progress:(message:string)=>void,resolutions?:Record<string,Resolution>):Promise<void>;
}
let mobile:MobileSyncClient|null=null;
export const installSyncClient=(value:MobileSyncClient)=>{mobile=value;};
export const getSyncClient=()=>mobile;
