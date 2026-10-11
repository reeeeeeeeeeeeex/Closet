import { z } from "zod";
import { context, json, failure, sameOrigin, limitedJson, ApiError } from "@/lib/server";
import { authorizeSync, getSyncState, newPairCode, pairDevice, applySync } from "@/lib/sync-server";
import { localStorage } from "@/lib/local-storage";
import { replicaSchema } from "@/lib/sync-model";
type Route = { params: Promise<{ action:string }> };
export async function GET(request:Request,route:Route){
  try{
    const {action}=await route.params;
    if(action==='state'){const d=authorizeSync(request);return json(getSyncState(d.db,d.owner));}
    if(action==='pairing'){const {db,owner}=await context(request);return json({devices:db.prepare("SELECT id,name,created_at AS createdAt FROM sync_devices WHERE owner=? ORDER BY created_at").bind(owner).rows()});}
    throw new ApiError(404,"同步接口不存在");
  }catch(e){return failure(e);}
}
export async function POST(request:Request,route:Route){
  try{
    sameOrigin(request); const {action}=await route.params;
    if(action==='pairing'){const {db,owner}=await context(request);return json(newPairCode(db,owner));}
    if(action==='pair'){
      const input=z.object({protocolVersion:z.literal(1),code:z.string().regex(/^[a-fA-F0-9]{10}$/),deviceId:z.string().uuid(),name:z.string().trim().min(1).max(100)}).strict().parse(await limitedJson(request,4000));
      return json(pairDevice(localStorage().db,input.code,input.deviceId,input.name));
    }
    if(action==='commit'){
      const device=authorizeSync(request);
      const input=z.object({protocolVersion:z.literal(1),requestId:z.string().uuid(),serverId:z.string().uuid(),expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),replica:replicaSchema}).strict().parse(await limitedJson(request,32*1024*1024));
      return json(applySync(device.db,device,input));
    }
    throw new ApiError(404,"同步接口不存在");
  }catch(e){return failure(e);}
}
export async function DELETE(request:Request,route:Route){
  try{
    sameOrigin(request);if((await route.params).action!=='pairing')throw new ApiError(404,"同步接口不存在");
    const {db,owner}=await context(request);const {id}=z.object({id:z.string().uuid()}).parse(await limitedJson(request,1000));
    db.transaction(()=>{db.prepare("DELETE FROM sync_receipts WHERE device_id IN (SELECT id FROM sync_devices WHERE owner=? AND id=?)").bind(owner,id).run();db.prepare("DELETE FROM sync_devices WHERE owner=? AND id=?").bind(owner,id).run();});
    return json({ok:true});
  }catch(e){return failure(e);}
}
