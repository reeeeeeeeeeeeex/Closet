import { context, json, failure, getState, getRecordsSync, insertRecord, sameOrigin, limitedJson, ApiError } from "@/lib/server";
import { validateArchive, type Asset } from "@/lib/domain";
import { mutateRecords, mutationSchema } from "@/lib/mutations";
import { rememberColors } from "@/lib/color-library";
import { itemColorStyle } from "@/lib/colors";
import { markDeleted } from "@/lib/sync-server";
export async function GET(request: Request) {
  try { const { db, owner } = await context(request); return json(await getState(db, owner, new URL(request.url).searchParams.get("collection") || undefined)); }
  catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const { db, owner } = await context(request);
    const body = mutationSchema.parse(await limitedJson(request, 128 * 1024));
    return json(db.transaction(() => {
      if (body.collectionId === "main") db.prepare("INSERT OR IGNORE INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, "main", "我的衣橱", new Date().toISOString()).run();
      if (!db.prepare("SELECT id FROM collections WHERE owner=? AND id=?").bind(owner, body.collectionId).rows().length) throw new ApiError(404, "衣橱不存在");
      const old = getRecordsSync(db, owner, body.collectionId);
      const assets = db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).rows<Asset>();
      const next = mutateRecords(old, body, assets);
      const map = new Map(next.records.map(r => [r.id, r]));
      for (const r of old) if (!map.has(r.id)) { db.prepare("DELETE FROM records WHERE owner=? AND collection_id=? AND id=?").bind(owner, body.collectionId, r.id).run(); markDeleted(db,owner,body.collectionId,r.id); }
      const previous = new Map(old.map(r => [r.id, r]));
      for (const r of next.records) {
        if (previous.get(r.id) === r) continue;
        if (previous.has(r.id)) db.prepare("UPDATE records SET data=?,version=?,updated_at=? WHERE owner=? AND collection_id=? AND id=?").bind(JSON.stringify(r.data), r.version, r.updatedAt, owner, body.collectionId, r.id).run();
        else insertRecord(db, owner, body.collectionId, r).run();
        if (r.kind === "item") rememberColors(db, owner, itemColorStyle(r.data).values, r.updatedAt);
      }
      return next.result;
    }));
  } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request); const { db, owner } = await context(request);
    let archive; try { archive = validateArchive(await limitedJson(request)); } catch (e) { throw new ApiError(400, e instanceof Error ? e.message : "备份无效"); }
    const assets = db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).rows<Asset>(); const map = new Map(assets.map(a => [a.hash, a]));
    for (const a of archive.assets) { const stored = map.get(a.hash); if (!stored || stored.size !== a.size || stored.mime !== a.mime) throw new ApiError(400, "备份图片缺失或未通过校验，请重新上传"); }
    const collectionId = crypto.randomUUID(), now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("INSERT INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, collectionId, archive.collection.name.slice(0, 94) + " · 导入", now).run();
      for (const record of archive.records) { insertRecord(db, owner, collectionId, record).run(); if (record.kind === "item") rememberColors(db, owner, itemColorStyle(record.data).values, record.updatedAt); }
      for (const color of archive.colorLibrary) rememberColors(db, owner, [color], color.usedAt);
    });
    return json({ ok: true, collectionId });
  } catch (e) { return failure(e); }
}
