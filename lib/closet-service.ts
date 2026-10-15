import { type Asset } from "./domain";
import { mutateRecords, mutationSchema } from "./mutations";
import { rememberColors } from "./color-library";
import { itemColorStyle } from "./colors";
import { markDeleted } from "./sync-server";
import { ApiError, getRecordsSync, insertRecord } from "./server";
import type { LocalDatabase } from "./local-storage";
import { createHash } from "node:crypto";

export function ensureCloset(db: LocalDatabase, owner: string, collectionId: string) {
  if (collectionId === "main") db.prepare("INSERT OR IGNORE INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, "main", "My wardrobe", new Date().toISOString()).run();
  if (!db.prepare("SELECT id FROM collections WHERE owner=? AND id=?").bind(owner, collectionId).rows().length) throw new ApiError(404, "衣橱不存在");
}

/** All writers share transactions, version checks, colors and sync tombstones. */
export function saveClosetMutation(db: LocalDatabase, owner: string, input: unknown, requestId?: string) {
  const body = mutationSchema.parse(input);
  return db.transaction(() => {
    const bodyHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    if (requestId) {
      const receipt = db.prepare("SELECT body_hash,response FROM tool_receipts WHERE owner=? AND collection_id=? AND request_id=?").bind(owner, body.collectionId, requestId).rows<{ body_hash: string; response: string }>()[0];
      if (receipt) {
        if (receipt.body_hash !== bodyHash) throw new ApiError(409, "本次保存编号已用于不同内容，请使用新的 requestId");
        return JSON.parse(receipt.response) as ReturnType<typeof mutateRecords>["result"];
      }
    }
    ensureCloset(db, owner, body.collectionId);
    const old = getRecordsSync(db, owner, body.collectionId);
    const assets = db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).rows<Asset>();
    const next = mutateRecords(old, body, assets);
    const map = new Map(next.records.map(r => [r.id, r]));
    for (const r of old) if (!map.has(r.id)) {
      db.prepare("DELETE FROM records WHERE owner=? AND collection_id=? AND id=?").bind(owner, body.collectionId, r.id).run();
      markDeleted(db, owner, body.collectionId, r.id);
    }
    const previous = new Map(old.map(r => [r.id, r]));
    for (const r of next.records) {
      if (previous.get(r.id) === r) continue;
      if (previous.has(r.id)) db.prepare("UPDATE records SET data=?,version=?,updated_at=? WHERE owner=? AND collection_id=? AND id=?").bind(JSON.stringify(r.data), r.version, r.updatedAt, owner, body.collectionId, r.id).run();
      else insertRecord(db, owner, body.collectionId, r).run();
      if (r.kind === "item") rememberColors(db, owner, itemColorStyle(r.data).values, r.updatedAt);
    }
    if (requestId) db.prepare("INSERT INTO tool_receipts VALUES (?,?,?,?,?)").bind(owner, body.collectionId, requestId, bodyHash, JSON.stringify(next.result)).run();
    return next.result;
  });
}
