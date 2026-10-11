import { z } from "zod";
import { context, json, failure, getState, getRecords, getRecordsSync, insertRecord, sameOrigin, limitedJson, ApiError } from "@/lib/server";
import { itemSchema, outfitSchema, subsetSchema, personalSizesSchema, dateSchema, validateArchive, makeSnapshot, photoAssets, type ClosetRecord, type ItemRecord, type OutfitRecord, type Asset } from "@/lib/domain";
import { validateSubsets } from "@/lib/subsets";
import type { LocalDatabase } from "@/lib/local-storage";
import { rememberColors } from "@/lib/color-library";
import { itemColorStyle } from "@/lib/colors";

function storeRecords(db: LocalDatabase, owner: string, collectionId: string, changes: ClosetRecord[], expectedVersion?: number, subsetId?: string) {
  return db.transaction(() => {
    const latest = getRecordsSync(db, owner, collectionId); const record = changes[0];
    const existing = latest.find(value => value.id === record.id);
    if (record.kind === "personalSizes" && latest.some(value => value.kind === "personalSizes" && value.id !== record.id)) throw new ApiError(409, "此衣橱已有尺码资料，请刷新后编辑。草稿仍保留。");
    if (expectedVersion !== undefined && (!existing || existing.version !== expectedVersion || existing.kind !== record.kind)) throw new ApiError(409, "记录已在其他设备更改，请刷新");
    if (existing?.kind === "subset" && record.kind === "subset" && (record.data.scope !== existing.data.scope || record.data.root !== existing.data.root || record.data.parentId !== existing.data.parentId)) throw new ApiError(400, "分组的上级分组和所属分类不能修改");
    if (latest.length + changes.length - (existing ? 1 : 0) > 2000) throw new ApiError(400, "此衣橱已达首版的 2000 条记录上限");
    let next = [...latest.filter(value => !changes.some(change => change.id === value.id)), ...changes];
    let membership;
    if (subsetId) {
      if (existing || (record.kind !== "item" && record.kind !== "outfit")) throw new ApiError(400, "只能在新增单品或搭配时指定分组");
      const subset = latest.find(value => value.id === subsetId);
      if (!subset || subset.kind !== "subset") throw new ApiError(404, "分组不存在");
      if (subset.data.scope !== record.kind) throw new ApiError(400, "分组范围与记录类型不匹配");
      membership = { ...subset, data: { ...subset.data, memberIds: [...new Set([...subset.data.memberIds, record.id])] }, version: subset.version + 1, updatedAt: record.updatedAt };
      next = next.map(value => value.id === subset.id ? membership! : value);
    }
    // Capture the current committed item/outfit data while holding the write lock.
    for (let index = 0; index < changes.length; index++) {
      const change = changes[index];
      if (change.kind !== "calendar" || existing) continue;
      const outfit = next.find(value => value.id === change.data.outfitId);
      if (!outfit || outfit.kind !== "outfit") throw new ApiError(400, "请选择有效搭配");
      const updated: ClosetRecord = { ...change, data: { ...change.data, snapshot: makeSnapshot(outfit.data, next.filter((value): value is ItemRecord => value.kind === "item")) } };
      changes[index] = updated; next = next.map(value => value.id === updated.id ? updated : value);
    }
    try { validateSubsets(next); } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "分组关系无效"); }
    if (existing) {
      const result = db.prepare("UPDATE records SET data=?,version=version+1,updated_at=? WHERE owner=? AND collection_id=? AND id=? AND version=?").bind(JSON.stringify(record.data), record.updatedAt, owner, collectionId, record.id, expectedVersion!).run();
      if (!result.changes) throw new ApiError(409, "记录已在其他设备更改，请刷新");
    } else for (const change of changes) insertRecord(db, owner, collectionId, change).run();
    if (membership) db.prepare("UPDATE records SET data=?,version=version+1,updated_at=? WHERE owner=? AND collection_id=? AND id=?").bind(JSON.stringify(membership.data), membership.updatedAt, owner, collectionId, membership.id).run();
    if (record.kind === "item") rememberColors(db, owner, itemColorStyle(record.data).values, record.updatedAt);
    return { ok: true, id: record.id, ...(record.kind === "personalSizes" ? { record } : {}) };
  });
}
export async function GET(request: Request) {
  try { const { db, owner } = await context(request); return json(await getState(db, owner, new URL(request.url).searchParams.get("collection") || undefined)); }
  catch (e) { return failure(e); }
}
const mutationSchema = z.object({ op: z.enum(["save", "deleteCalendar", "deleteSubset"]), collectionId: z.string().min(1).max(100), id: z.string().uuid().optional(), version: z.number().int().positive().optional(), subsetId: z.string().uuid().optional(), kind: z.enum(["item", "outfit", "calendar", "subset", "personalSizes"]), data: z.unknown() });
export async function POST(request: Request) {
  try {
    sameOrigin(request); const { db, owner } = await context(request); const body = mutationSchema.parse(await limitedJson(request, 128 * 1024));
    const { collectionId, kind } = body;
    if (collectionId === "main") await db.prepare("INSERT OR IGNORE INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, "main", "我的衣橱", new Date().toISOString()).run();
    else if (!await db.prepare("SELECT id FROM collections WHERE owner=? AND id=?").bind(owner, collectionId).first()) throw new ApiError(404, "衣橱不存在");
    const records = await getRecords(db, owner, collectionId); const existing = body.id ? records.find(r => r.id === body.id) : undefined;
    if (body.id && (!existing || existing.kind !== kind)) throw new ApiError(404, "记录不存在");
    if (existing && existing.version !== body.version) throw new ApiError(409, kind === "personalSizes" ? "另一台设备已修改尺码。草稿仍保留，请载入最新尺码后重新确认。" : "另一台设备已修改这条记录。草稿仍保留，请关闭编辑、刷新后重新确认。");
    if (body.op === "deleteSubset") {
      if (!existing || existing.kind !== "subset") throw new ApiError(400, "只能删除分组");
      const result = db.transaction(() => {
        const latest = getRecordsSync(db, owner, collectionId);
        const target = latest.find(record => record.id === existing.id);
        if (!target || target.kind !== "subset" || target.version !== body.version) throw new ApiError(409, "分组已在其他设备更改，请刷新后重试");
        const now = new Date().toISOString();
        const changes = latest.filter(record => record.kind === "subset" && (record.data.parentId === target.id || record.id === target.data.parentId)).map(record => {
          if (record.kind !== "subset") throw new Error("Expected subset");
          const data = record.id === target.data.parentId ? { ...record.data, memberIds: [...new Set([...record.data.memberIds, ...target.data.memberIds])] } : { ...record.data, parentId: target.data.parentId };
          return { ...record, data, version: record.version + 1, updatedAt: now };
        });
        const changed = new Map(changes.map(record => [record.id, record]));
        validateSubsets(latest.filter(record => record.id !== target.id).map(record => changed.get(record.id) || record));
        for (const record of changes) db.prepare("UPDATE records SET data=?,version=?,updated_at=? WHERE owner=? AND collection_id=? AND id=?").bind(JSON.stringify(record.data), record.version, now, owner, collectionId, record.id).run();
        db.prepare("DELETE FROM records WHERE owner=? AND collection_id=? AND id=?").bind(owner, collectionId, target.id).run();
        return { ok: true, parentId: target.data.parentId };
      });
      return json(result);
    }
    if (body.op === "deleteCalendar") {
      if (!existing || existing.kind !== "calendar") throw new ApiError(400, "只能删除日历记录");
      const result = await db.prepare("DELETE FROM records WHERE owner=? AND collection_id=? AND id=? AND version=? RETURNING id").bind(owner, collectionId, existing.id, existing.version).first();
      if (!result) throw new ApiError(409, "记录已在其他设备更改，请刷新"); return json({ ok: true });
    }
    let data: ClosetRecord["data"];
    if (kind === "item") {
      const item = itemSchema.parse(body.data);
      if (item.colorStyle) item.color = item.colorStyle.values[0]?.name || "";
      for (const hash of photoAssets(item)) if (!await db.prepare("SELECT hash FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first()) throw new ApiError(400, "原图尚未上传完成");
      data = item;
    } else if (kind === "outfit") {
      data = outfitSchema.parse(body.data);
      for (const hash of photoAssets(data)) if (!await db.prepare("SELECT hash FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first()) throw new ApiError(400, "搭配原图尚未上传完成");
      if (new Set(data.itemIds).size !== data.itemIds.length) throw new ApiError(400, "搭配不能重复添加同一单品");
      if (data.itemIds.some(id => !records.some(r => r.id === id && r.kind === "item"))) throw new ApiError(400, "搭配中的单品不存在");
    } else if (kind === "subset") {
      data = subsetSchema.parse(body.data);
    } else if (kind === "personalSizes") {
      data = personalSizesSchema.parse(body.data);
    } else {
      const input = z.object({ date: dateSchema, status: z.enum(["planned", "worn"]), outfitId: z.string().uuid().optional(), newOutfit: outfitSchema.optional(), notes: z.string().max(3000) }).strict()
        .refine(v => !!v.outfitId !== !!v.newOutfit, "请选择已有搭配或添加新搭配照片").parse(body.data);
      if (input.newOutfit) {
        if (existing) throw new ApiError(400, "历史搭配快照不可替换，请新建记录");
        const outfitData = input.newOutfit;
        if (!outfitData.asset) throw new ApiError(400, "请添加搭配照片");
        for (const hash of photoAssets(outfitData)) if (!await db.prepare("SELECT hash FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first()) throw new ApiError(400, "搭配原图尚未上传完成");
        if (outfitData.itemIds.some(id => !records.some(r => r.id === id && r.kind === "item"))) throw new ApiError(400, "搭配中的单品不存在");
        if (records.length > 1998) throw new ApiError(400, "添加照片穿搭需要两条记录，此衣橱容量不足");
        const now = new Date().toISOString();
        const outfit: OutfitRecord = { id: crypto.randomUUID(), kind: "outfit", data: { ...outfitData, archived: false }, version: 1, createdAt: now, updatedAt: now };
        const calendar: ClosetRecord = { id: crypto.randomUUID(), kind: "calendar", data: { date: input.date, status: input.status, notes: input.notes, outfitId: outfit.id, snapshot: makeSnapshot(outfit.data, records.filter((r): r is ItemRecord => r.kind === "item")) }, version: 1, createdAt: now, updatedAt: now };
        storeRecords(db, owner, collectionId, [outfit, calendar], undefined, body.subsetId);
        return json({ ok: true, outfitId: outfit.id });
      }
      const calendarInput = { date: input.date, status: input.status, outfitId: input.outfitId!, notes: input.notes };
      if (existing?.kind === "calendar") {
        if (input.outfitId !== existing.data.outfitId) throw new ApiError(400, "历史搭配快照不可替换，请新建记录");
        data = { ...calendarInput, snapshot: existing.data.snapshot };
      } else {
        const outfit = records.find(r => r.id === input.outfitId && r.kind === "outfit");
        if (!outfit || outfit.kind !== "outfit") throw new ApiError(400, "请选择有效搭配");
        data = { ...calendarInput, snapshot: makeSnapshot(outfit.data, records.filter((r): r is ItemRecord => r.kind === "item")) };
      }
    }
    const now = new Date().toISOString();
    if (existing) {
      return json(storeRecords(db, owner, collectionId, [{ ...existing, data, updatedAt: now, version: existing.version + 1 } as ClosetRecord], existing.version, body.subsetId));
    } else {
      return json(storeRecords(db, owner, collectionId, [{ id: crypto.randomUUID(), kind, data, version: 1, createdAt: now, updatedAt: now } as ClosetRecord], undefined, body.subsetId));
    }
  } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request); const { db, owner } = await context(request);
    let archive; try { archive = validateArchive(await limitedJson(request)); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, e instanceof Error ? e.message : "备份无效"); }
    const assets = (await db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).all<Asset>()).results; const map = new Map(assets.map(a => [a.hash, a]));
    for (const a of archive.assets) { const stored = map.get(a.hash); if (!stored || stored.size !== a.size || stored.mime !== a.mime) throw new ApiError(400, "备份图片缺失或未通过校验，请重新上传"); }
    const collectionId = crypto.randomUUID(); const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("INSERT INTO collections (owner,id,name,created_at) VALUES (?,?,?,?)").bind(owner, collectionId, archive.collection.name.slice(0, 94) + " · 导入", now).run();
      for (const record of archive.records) {
        insertRecord(db, owner, collectionId, record).run();
        if (record.kind === "item") rememberColors(db, owner, itemColorStyle(record.data).values, record.updatedAt);
      }
      for (const color of archive.colorLibrary) rememberColors(db, owner, [color], color.usedAt);
    });
    return json({ ok: true, collectionId });
  } catch (e) { return failure(e); }
}
