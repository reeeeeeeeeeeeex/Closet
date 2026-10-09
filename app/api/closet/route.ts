import { z } from "zod";
import { context, json, failure, getState, getRecords, insertRecord, sameOrigin, limitedJson, ApiError } from "@/lib/server";
import { itemSchema, outfitSchema, dateSchema, validateArchive, makeSnapshot, type ClosetRecord, type ItemRecord, type Asset } from "@/lib/domain";
export async function GET(request: Request) {
  try { const { db, owner } = await context(); return json(await getState(db, owner, new URL(request.url).searchParams.get("collection") || undefined)); }
  catch (e) { return failure(e); }
}
const mutationSchema = z.object({ op: z.enum(["save", "deleteCalendar"]), collectionId: z.string().min(1).max(100), id: z.string().uuid().optional(), version: z.number().int().positive().optional(), kind: z.enum(["item", "outfit", "calendar"]), data: z.unknown() });
export async function POST(request: Request) {
  try {
    sameOrigin(request); const { db, owner } = await context(); const body = mutationSchema.parse(await limitedJson(request, 64000));
    const { collectionId, kind } = body;
    if (collectionId === "main") await db.prepare("INSERT OR IGNORE INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, "main", "我的衣橱", new Date().toISOString()).run();
    else if (!await db.prepare("SELECT id FROM collections WHERE owner=? AND id=?").bind(owner, collectionId).first()) throw new ApiError(404, "衣橱不存在");
    const records = await getRecords(db, owner, collectionId); const existing = body.id ? records.find(r => r.id === body.id) : undefined;
    if (body.id && (!existing || existing.kind !== kind)) throw new ApiError(404, "记录不存在");
    if (existing && existing.version !== body.version) throw new ApiError(409, "另一台设备已修改这条记录。草稿仍保留，请关闭编辑、刷新后重新确认。");
    if (body.op === "deleteCalendar") {
      if (!existing || existing.kind !== "calendar") throw new ApiError(400, "只能删除日历记录");
      const result = await db.prepare("DELETE FROM records WHERE owner=? AND collection_id=? AND id=? AND version=? RETURNING id").bind(owner, collectionId, existing.id, existing.version).first();
      if (!result) throw new ApiError(409, "记录已在其他设备更改，请刷新"); return json({ ok: true });
    }
    let data: ClosetRecord["data"];
    if (kind === "item") {
      data = itemSchema.parse(body.data);
      if (data.asset && !await db.prepare("SELECT hash FROM assets WHERE owner=? AND hash=?").bind(owner, data.asset).first()) throw new ApiError(400, "原图尚未上传完成");
    } else if (kind === "outfit") {
      data = outfitSchema.parse(body.data);
      if (new Set(data.itemIds).size !== data.itemIds.length) throw new ApiError(400, "搭配不能重复添加同一单品");
      if (data.itemIds.some(id => !records.some(r => r.id === id && r.kind === "item"))) throw new ApiError(400, "搭配中的单品不存在");
    } else {
      const input = z.object({ date: dateSchema, status: z.enum(["planned", "worn"]), outfitId: z.string().uuid(), notes: z.string().max(3000) }).parse(body.data);
      if (existing?.kind === "calendar") {
        if (input.outfitId !== existing.data.outfitId) throw new ApiError(400, "历史搭配快照不可替换，请新建记录");
        data = { ...input, snapshot: existing.data.snapshot };
      } else {
        const outfit = records.find(r => r.id === input.outfitId && r.kind === "outfit");
        if (!outfit || outfit.kind !== "outfit") throw new ApiError(400, "请选择有效搭配");
        data = { ...input, snapshot: makeSnapshot(outfit.data, records.filter((r): r is ItemRecord => r.kind === "item")) };
      }
    }
    const now = new Date().toISOString();
    if (existing) {
      const result = await db.prepare("UPDATE records SET data=?,version=version+1,updated_at=? WHERE owner=? AND collection_id=? AND id=? AND version=? RETURNING id").bind(JSON.stringify(data), now, owner, collectionId, existing.id, existing.version).first();
      if (!result) throw new ApiError(409, "另一台设备刚刚修改了记录，请刷新后重试");
    } else {
      if (records.length >= 2000) throw new ApiError(400, "此衣橱已达首版的 2000 条记录上限");
      await insertRecord(db, owner, collectionId, { id: crypto.randomUUID(), kind, data, version: 1, createdAt: now, updatedAt: now } as ClosetRecord).run();
    }
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request); const { db, owner } = await context();
    let archive; try { archive = validateArchive(await limitedJson(request)); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, e instanceof Error ? e.message : "备份无效"); }
    const assets = (await db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).all<Asset>()).results; const map = new Map(assets.map(a => [a.hash, a]));
    for (const a of archive.assets) { const stored = map.get(a.hash); if (!stored || stored.size !== a.size || stored.mime !== a.mime) throw new ApiError(400, "备份图片缺失或未通过校验，请重新上传"); }
    const collectionId = crypto.randomUUID(); const now = new Date().toISOString();
    await db.batch([ db.prepare("INSERT INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, collectionId, archive.collection.name.slice(0, 94) + " · 导入", now), ...archive.records.map(r => insertRecord(db, owner, collectionId, r)) ]);
    return json({ ok: true, collectionId });
  } catch (e) { return failure(e); }
}
