import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ApiError, getRecordsSync, insertRecord } from "./server";
import { localStorage, type LocalDatabase } from "./local-storage";
import { getColorLibrary, rememberColors } from "./color-library";
import { canonical, normalizeReplica, validateReplica, type Replica } from "./sync-model";
import { type Asset, type Collection } from "./domain";
import { itemColorStyle } from "./colors";
export const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export function serverId(db: LocalDatabase) {
  db.prepare("INSERT OR IGNORE INTO sync_meta (key,value) VALUES ('serverId',?)").bind(randomUUID()).run();
  return db.prepare("SELECT value FROM sync_meta WHERE key='serverId'").rows<{ value: string }>()[0].value;
}
export function snapshot(db: LocalDatabase, owner: string) {
  db.prepare("INSERT OR IGNORE INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner,"main","我的衣橱",new Date().toISOString()).run();
  const collections = db.prepare("SELECT id,name,created_at AS createdAt FROM collections WHERE owner=? ORDER BY created_at,id").bind(owner).rows<Collection>();
  for (const c of collections) db.prepare("INSERT OR IGNORE INTO sync_collections (owner,collection_id,sync_id) VALUES (?,?,?)").bind(owner,c.id,randomUUID()).run();
  const ids = new Map(db.prepare("SELECT collection_id,sync_id FROM sync_collections WHERE owner=?").bind(owner).rows<{collection_id:string;sync_id:string}>().map(c => [c.collection_id,c.sync_id]));
  const replica = normalizeReplica({ collections: collections.map(c => ({...c,id:ids.get(c.id)!,records:getRecordsSync(db,owner,c.id)})), assets:db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).rows<Asset>(), colorLibrary:db.prepare("SELECT name,hex,used_at AS usedAt FROM color_library WHERE owner=?").bind(owner).rows<Replica["colorLibrary"][number]>(),tombstones:db.prepare('SELECT sync_id AS collectionId,record_id AS id,deleted_at AS deletedAt FROM sync_tombstones WHERE owner=?').bind(owner).rows<Replica['tombstones'][number]>() });
  return { protocolVersion: 1 as const, serverId:serverId(db), replica, revision:sha(canonical(replica)) };
}
export function markDeleted(db:LocalDatabase,owner:string,collectionId:string,id:string){
  db.prepare('INSERT OR IGNORE INTO sync_collections (owner,collection_id,sync_id) VALUES (?,?,?)').bind(owner,collectionId,randomUUID()).run();
  const syncId=db.prepare('SELECT sync_id FROM sync_collections WHERE owner=? AND collection_id=?').bind(owner,collectionId).rows<{sync_id:string}>()[0].sync_id;
  db.prepare('INSERT OR REPLACE INTO sync_tombstones VALUES (?,?,?,?)').bind(owner,syncId,id,new Date().toISOString()).run();
}
export function getSyncState(db: LocalDatabase,owner: string) { getColorLibrary(db,owner); return db.transaction(() => snapshot(db,owner)); }
export function authorizeSync(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const {db,bucket} = localStorage();
  const device = token ? db.prepare("SELECT id,owner,device_id FROM sync_devices WHERE token_hash=?").bind(sha(token)).rows<{id:string;owner:string;device_id:string}>()[0] : undefined;
  if (!device) throw new ApiError(401,"同步配对已失效，请重新配对");
  return {db,bucket,...device};
}
export function newPairCode(db: LocalDatabase,owner: string) {
  const code = randomBytes(5).toString("hex").toUpperCase(), expires = Date.now()+5*60*1000;
  db.prepare("DELETE FROM sync_codes WHERE owner=? OR expires<?").bind(owner,Date.now()).run();
  db.prepare("INSERT INTO sync_codes VALUES (?,?,?)").bind(sha(code),owner,expires).run();
  return {code,expires,serverId:serverId(db),protocolVersion:1};
}
export function pairDevice(db: LocalDatabase,code: string,deviceId: string,name: string) {
  return db.transaction(() => {
    const pairing = db.prepare("SELECT owner FROM sync_codes WHERE code_hash=? AND expires>?").bind(sha(code.toUpperCase()),Date.now()).rows<{owner:string}>()[0];
    if (!pairing) throw new ApiError(400,"配对码错误或已过期，请在电脑上重新生成");
    db.prepare("DELETE FROM sync_codes WHERE code_hash=?").bind(sha(code.toUpperCase())).run();
    const token = randomBytes(32).toString("hex"), id = randomUUID();
    db.prepare("INSERT INTO sync_devices VALUES (?,?,?,?,?,?)").bind(id,pairing.owner,deviceId,name,sha(token),new Date().toISOString()).run();
    return { protocolVersion:1,serverId:serverId(db),owner:pairing.owner,token,id };
  });
}
export function applySync(db: LocalDatabase,device: {id:string;owner:string},input: {requestId:string;expectedRevision:string;replica:Replica;serverId:string}) {
  const replica = validateReplica(input.replica), bodyHash=sha(canonical(input));
  getColorLibrary(db,device.owner);
  return db.transaction(() => {
    if (input.serverId!==serverId(db)) throw new ApiError(409,"电脑身份已改变，请重新配对");
    const receipt=db.prepare("SELECT body_hash,response FROM sync_receipts WHERE device_id=? AND request_id=?").bind(device.id,input.requestId).rows<{body_hash:string;response:string}>()[0];
    if(receipt){if(receipt.body_hash!==bodyHash)throw new ApiError(409,"重复提交内容不一致");return JSON.parse(receipt.response);}
    const before=snapshot(db,device.owner);
    if(before.revision!==input.expectedRevision)throw new ApiError(409,"电脑资料在同步期间已修改，请再次同步", "SYNC_CHANGED");
    if(before.replica.collections.some(c=>!replica.collections.some(n=>n.id===c.id)))throw new ApiError(400,"不能通过同步删除衣橱");
    const assets=new Map(db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(device.owner).rows<Asset>().map(a=>[a.hash,a]));
    for(const a of replica.assets){const actual=assets.get(a.hash);if(!actual||actual.size!==a.size||actual.mime!==a.mime)throw new ApiError(400,"同步原图尚未完整传输");}
    for(const c of replica.collections){
      let localId=db.prepare("SELECT collection_id FROM sync_collections WHERE owner=? AND sync_id=?").bind(device.owner,c.id).rows<{collection_id:string}>()[0]?.collection_id;
      if(!localId){localId=randomUUID();db.prepare("INSERT INTO collections VALUES (?,?,?,?)").bind(device.owner,localId,c.name,c.createdAt).run();db.prepare("INSERT INTO sync_collections VALUES (?,?,?)").bind(device.owner,localId,c.id).run();}
      const old=new Map(getRecordsSync(db,device.owner,localId).map(r=>[r.id,r]));
      for(const r of c.records){
        db.prepare('DELETE FROM sync_tombstones WHERE owner=? AND sync_id=? AND record_id=?').bind(device.owner,c.id,r.id).run();
        const previous=old.get(r.id);old.delete(r.id);
        if(previous&&canonical(previous)===canonical(r))continue;
        const value={...r,version:previous?Math.max(previous.version,r.version)+1:r.version};
        if(previous)db.prepare("UPDATE records SET data=?,version=?,updated_at=? WHERE owner=? AND collection_id=? AND id=?").bind(JSON.stringify(value.data),value.version,value.updatedAt,device.owner,localId,r.id).run();
        else insertRecord(db,device.owner,localId,value).run();
        if(r.kind==='item')rememberColors(db,device.owner,itemColorStyle(r.data).values,r.updatedAt);
      }
      for(const id of old.keys()){db.prepare("DELETE FROM records WHERE owner=? AND collection_id=? AND id=?").bind(device.owner,localId,id).run();markDeleted(db,device.owner,localId,id);}
    }
    for(const c of replica.colorLibrary)rememberColors(db,device.owner,[c],c.usedAt);
    for(const t of replica.tombstones)db.prepare('INSERT OR REPLACE INTO sync_tombstones VALUES (?,?,?,?)').bind(device.owner,t.collectionId,t.id,t.deletedAt).run();
    const response=snapshot(db,device.owner);
    db.prepare("INSERT INTO sync_receipts VALUES (?,?,?,?)").bind(device.id,input.requestId,bodyHash,JSON.stringify(response)).run();
    db.prepare('DELETE FROM sync_receipts WHERE device_id=? AND rowid NOT IN (SELECT rowid FROM sync_receipts WHERE device_id=? ORDER BY rowid DESC LIMIT 32)').bind(device.id,device.id).run();
    return response;
  });
}
