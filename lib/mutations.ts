import { z } from "zod";
import { itemSchema, outfitSchema, subsetSchema, personalSizesSchema, noteSchema, dateSchema, makeSnapshot, photoAssets, validateNotes, validateRecordAssets, type Asset, type ClosetRecord, type ItemRecord } from "./domain";
import { validateSubsets } from "./subsets";

export class MutationError extends Error { constructor(public status: number, message: string) { super(message); } }
export const mutationSchema = z.object({ op: z.enum(["save", "deleteItem", "deleteCalendar", "deleteSubset", "deleteNote"]), collectionId: z.string().min(1).max(100), id: z.string().uuid().optional(), version: z.number().int().positive().optional(), subsetId: z.string().uuid().optional(), kind: z.enum(["item", "outfit", "calendar", "subset", "personalSizes", "note"]), data: z.unknown() });
export function mutateRecords(records: ClosetRecord[], input: unknown, assets: Asset[], now = new Date().toISOString()) {
  const body = mutationSchema.parse(input), existing = records.find(r => r.id === body.id);
  const fail = (status: number, message: string): never => { throw new MutationError(status, message); };
  if (body.id && (!existing || existing.kind !== body.kind)) fail(404, "记录不存在");
  if (existing && existing.version !== body.version) fail(409, "另一台设备已修改这条记录。草稿仍保留，请载入最新记录后重新确认。");
  let next = [...records]; const result: { ok: true; id?: string; record?: ClosetRecord; parentId?: string | null; outfitId?: string; removedOutfits?: string[] } = { ok: true };
  if (body.op === "deleteNote") {
    if (existing?.kind !== "note") return fail(400, "只能删除笔记");
    next = next.filter(r => r.id !== existing.id);
  } else if (body.op === "deleteCalendar") {
    if (existing?.kind !== "calendar") return fail(400, "只能删除日历记录");
    next = next.filter(r => r.id !== existing.id);
  } else if (body.op === "deleteItem") {
    if (existing?.kind !== "item") return fail(400, "只能删除单品");
    // Delete the item, unlink it from outfits and groups, and drop outfits left with no items and no photos.
    // Calendar snapshots keep their own copies, so history stays readable without the item record.
    const removed = new Set([existing.id]);
    for (const r of next) if (r.kind === "outfit" && r.data.itemIds.includes(existing.id) && r.data.itemIds.every(id => id === existing.id) && !photoAssets(r.data).length) removed.add(r.id);
    next = next.filter(r => !removed.has(r.id)).map(r => {
      if (r.kind === "outfit" && r.data.itemIds.some(id => id === existing.id)) return { ...r, data: { ...r.data, itemIds: r.data.itemIds.filter(id => id !== existing.id) }, version: r.version + 1, updatedAt: now };
      if (r.kind === "subset" && r.data.memberIds.some(id => removed.has(id))) return { ...r, data: { ...r.data, memberIds: r.data.memberIds.filter(id => !removed.has(id)) }, version: r.version + 1, updatedAt: now };
      return r;
    });
    result.removedOutfits = [...removed].filter(id => id !== existing.id);
  } else if (body.op === "deleteSubset") {
    if (existing?.kind !== "subset") return fail(400, "只能删除分组");
    const target = existing;
    next = next.filter(r => r.id !== target.id).map(r => {
      if (r.kind === "note" && r.data.subsetId === target.id) return { ...r, data: { ...r.data, subsetId: target.data.parentId }, version: r.version + 1, updatedAt: now };
      if (r.kind !== "subset" || (r.id !== target.data.parentId && r.data.parentId !== target.id)) return r;
      const data = r.id === target.data.parentId ? { ...r.data, memberIds: [...new Set([...r.data.memberIds, ...target.data.memberIds])] } : { ...r.data, parentId: target.data.parentId };
      return { ...r, data, version: r.version + 1, updatedAt: now };
    });
    result.parentId = target.data.parentId;
  } else {
    let data: ClosetRecord["data"];
    if (body.kind === "item") { const item = itemSchema.parse(body.data); if (item.colorStyle) item.color = item.colorStyle.values[0]?.name || ""; data = item; }
    else if (body.kind === "outfit") data = outfitSchema.parse(body.data);
    else if (body.kind === "note") data = noteSchema.parse(body.data);
    else if (body.kind === "subset") {
      data = subsetSchema.parse(body.data);
      if (existing?.kind === "subset" && (data.scope !== existing.data.scope || data.root !== existing.data.root || data.parentId !== existing.data.parentId)) fail(400, "分组的上级分组和所属分类不能修改");
    } else if (body.kind === "personalSizes") {
      data = personalSizesSchema.parse(body.data);
      if (records.some(r => r.kind === "personalSizes" && r.id !== existing?.id)) fail(409, "此衣橱已有尺码资料，请刷新后编辑。草稿仍保留。");
    } else {
      const calendar = z.object({ date: dateSchema, status: z.enum(["planned", "worn"]), outfitId: z.string().uuid().optional(), newOutfit: outfitSchema.optional(), notes: z.string().max(3000) }).strict().refine(v => !!v.outfitId !== !!v.newOutfit, "请选择已有搭配或添加新搭配照片").parse(body.data);
      let outfitId = calendar.outfitId;
      if (calendar.newOutfit) {
        if (existing) fail(400, "历史搭配快照不可替换，请新建记录");
        if (!calendar.newOutfit.asset) fail(400, "请添加搭配照片");
        outfitId = crypto.randomUUID(); result.outfitId = outfitId;
        next.push({ id: outfitId, kind: "outfit", data: { ...calendar.newOutfit, archived: false }, version: 1, createdAt: now, updatedAt: now });
      }
      const outfit = next.find(r => r.id === outfitId);
      // A calendar entry whose outfit was deleted keeps its own snapshot; only new links need a real outfit.
      if (outfit?.kind !== "outfit") {
        if (!outfitId || existing?.kind !== "calendar" || outfitId !== existing.data.outfitId) return fail(400, "请选择有效搭配");
        data = { date: calendar.date, status: calendar.status, notes: calendar.notes, outfitId, snapshot: existing.data.snapshot };
      } else {
        if (existing?.kind === "calendar" && outfitId !== existing.data.outfitId) fail(400, "历史搭配快照不可替换，请新建记录");
        data = { date: calendar.date, status: calendar.status, notes: calendar.notes, outfitId: outfit.id, snapshot: existing?.kind === "calendar" ? existing.data.snapshot : makeSnapshot(outfit.data, next.filter((r): r is ItemRecord => r.kind === "item")) };
      }
    }
    const record = { id: existing?.id || crypto.randomUUID(), kind: body.kind, data, version: (existing?.version || 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now } as ClosetRecord;
    next = [...next.filter(r => r.id !== record.id), record]; result.id = record.id;
    if (record.kind === "personalSizes") result.record = record;
    if (body.subsetId) {
      const member = result.outfitId ? next.find(r => r.id === result.outfitId)! : record;
      if (existing || !["item", "outfit"].includes(member.kind)) fail(400, "只能在新增单品或搭配时指定分组");
      const subset = next.find(r => r.id === body.subsetId);
      if (subset?.kind !== "subset") return fail(404, "分组不存在");
      if (subset.data.scope !== member.kind) fail(400, "分组范围与记录类型不匹配");
      next = next.map(r => r.id === subset.id ? { ...subset, data: { ...subset.data, memberIds: [...new Set([...subset.data.memberIds, member.id])] }, version: subset.version + 1, updatedAt: now } : r);
    }
  }
  if (next.length > 2000) fail(400, "此衣橱已达首版的 2000 条记录上限");
  for (const r of next) if (r.kind === "outfit" && r.data.itemIds.some(id => !next.some(i => i.id === id && i.kind === "item"))) fail(400, "搭配中的单品不存在");
  try { validateSubsets(next); validateNotes(next); validateRecordAssets(next, assets); }
  catch (e) { fail(400, e instanceof Error ? e.message : "分组关系无效"); }
  return { records: next, result };
}
