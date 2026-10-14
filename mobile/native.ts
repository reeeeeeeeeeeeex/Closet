import { registerPlugin } from "@capacitor/core";
import type { Asset, ClosetArchive } from "../lib/domain";
import type { ModelSettings } from "../lib/ai-types";
interface NativeStorage {
  modelSettings(options:{owner:string}):Promise<{settings:ModelSettings|null}>;
  saveModelSettings(options:{owner:string;settings:ModelSettings & {apiKey?:string}}):Promise<{settings:ModelSettings}>;
  clearModelSettings(options:{owner:string}):Promise<void>;
  modelRequest(options:{owner:string;requestId:string;body:string}):Promise<{status:number;body:string}>;
  cancelModelRequest(options:{requestId:string}):Promise<void>;
  previewAsset(options:{owner:string;hash:string;size:number}):Promise<{data:string;mimeType:"image/jpeg"}>;
  read(options:{key:string}):Promise<{revision:number;value:string|null;filesRoot:string}>;
  write(options:{key:string;expected:number;value:string}):Promise<{revision:number}>;
  beginFile(options:{owner:string}):Promise<{handle:string}>;
  appendFile(options:{handle:string;data:string}):Promise<void>;
  finishFile(options:{handle:string;owner:string;name:string}):Promise<{asset:Asset}>;
  pickArchive():Promise<{handle:string;manifest:ClosetArchive;cancelled?:boolean}>;
  importStaged(options:{handle:string;owner:string}):Promise<void>;
  exportArchive(options:{owner:string;manifest:ClosetArchive;filename:string}):Promise<{saved:boolean}>;
  saveAsset(options:{owner:string;asset:Asset}):Promise<{saved:boolean}>;
  http(options:{url:string;method:string;token?:string;body?:string}):Promise<{status:number;body:string}>;
  transfer(options:{url:string;token:string;owner:string;asset:Asset;direction:"upload"|"download"}):Promise<void>;
}
export const Native = registerPlugin<NativeStorage>("ClosetStorage");
