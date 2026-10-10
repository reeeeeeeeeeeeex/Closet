import { z } from "zod";
import { CATEGORY_MEASUREMENTS, garmentCategory, type Measurement } from "./item-details";
import { DEFAULT_LOCALE, messageForLocale } from "./i18n/core";
import { validateSubsets } from "./subsets";
export const CATEGORIES = { top: "上装", bottom: "下装", dress: "连体 / 裙装", outerwear: "外套", shoes: "鞋履", bag: "包袋", accessory: "配饰" } as const;
export const OCCASIONS = { work: "通勤", casual: "日常", party: "聚会", formal: "正式", vacation: "旅行", sport: "运动" } as const;
export const SEASONS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" } as const;
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const MAX_PHOTOS = 20;
const photosSchema = z.array(hashSchema).max(MAX_PHOTOS, "每条记录最多添加 20 张照片").optional();
export type PhotoData = { asset: string | null; photos?: string[] };
export function photoAssets(data: PhotoData): string[] { return data.photos ?? (data.asset ? [data.asset] : []); }
function validatePhotos(data: PhotoData, ctx: z.RefinementCtx) {
  if (!data.photos) return; // Existing records keep their original single cover.
  if (new Set(data.photos).size !== data.photos.length) ctx.addIssue({ code: "custom", message: "照片不能重复添加", path: ["photos"] });
  if (data.photos.length ? !data.asset || !data.photos.includes(data.asset) : data.asset !== null) ctx.addIssue({ code: "custom", message: "封面必须是已添加的照片", path: ["asset"] });
}
const id = z.string().uuid();
const title = z.string().trim().min(1, "请填写名称").max(100);
const note = z.string().max(3000);
const occasions = z.array(z.enum(["work", "casual", "party", "formal", "vacation", "sport"])).max(6);
const centimeters = z.number().finite().positive("尺寸必须大于 0").max(500, "尺寸不能超过 500 cm").optional();
const measurementsSchema = z.object({ shoulderWidth: centimeters, chest: centimeters, waist: centimeters, hips: centimeters, thigh: centimeters, legOpening: centimeters, length: centimeters, sleeveLength: centimeters, rise: centimeters, hem: centimeters }).strict();
export const shoeSizeSchema = z.object({ eu: z.number().finite().min(10, "欧码需在 10 到 60 之间").max(60, "欧码需在 10 到 60 之间").nullable().default(null), cn: z.number().int().min(100, "中国码需在 100 到 350 mm 之间").max(350, "中国码需在 100 到 350 mm 之间").multipleOf(5, "中国码以 5 mm 为间隔").nullable().default(null) }).strict().default({ eu: null, cn: null });
export const personalSizesSchema = z.object({
  measurements: z.object({ height: centimeters, shoulderWidth: centimeters, chest: centimeters, waist: centimeters, hips: centimeters, thigh: centimeters, armLength: centimeters, inseam: centimeters, outseam: centimeters, footLength: centimeters }).strict().default({}),
  shoeSize: shoeSizeSchema,
}).strict();
export type PersonalSizes = z.infer<typeof personalSizesSchema>;
export const itemSchema = z.object({
  name: title, category: z.enum(["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"]),
  brand: z.string().trim().max(100, "品牌名称不能超过 100 个字符").optional(),
  color: z.string().max(50), seasons: z.array(z.enum(["spring", "summer", "autumn", "winter"])).max(4),
  occasions, notes: note, asset: hashSchema.nullable(), photos: photosSchema, archived: z.boolean(),
  fit: z.enum(["tight", "fitted", "regular", "loose"]).nullable().default(null),
  shoeFit: z.enum(["trueToSize", "large", "small"]).nullable().default(null),
  shoeSize: shoeSizeSchema,
  measurements: measurementsSchema.default({}),
}).strict().superRefine((item, ctx) => {
  validatePhotos(item, ctx);
  if (!garmentCategory(item.category) && item.fit) ctx.addIssue({ code: "custom", message: "此分类不适用服装版型", path: ["fit"] });
  if (item.category !== "shoes" && (item.shoeFit || item.shoeSize.eu !== null || item.shoeSize.cn !== null)) ctx.addIssue({ code: "custom", message: "鞋码和合脚程度仅适用于鞋履", path: ["shoeSize"] });
  const allowed = CATEGORY_MEASUREMENTS[item.category] || [];
  for (const key of Object.keys(item.measurements) as Measurement[]) if (!allowed.includes(key)) ctx.addIssue({ code: "custom", message: "此分类不适用这项尺寸", path: ["measurements", key] });
});
export const outfitSchema = z.object({ name: title, itemIds: z.array(id).max(30), asset: hashSchema.nullable().default(null), photos: photosSchema, occasions, notes: note, archived: z.boolean() }).strict().superRefine(validatePhotos)
  .refine(o => !!o.asset || o.itemIds.length > 0, "请添加搭配照片或选择至少一件单品")
  .refine(o => new Set(o.itemIds).size === o.itemIds.length, "搭配不能重复添加同一单品");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T12:00:00Z"); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}, "日期无效");
export const snapshotSchema = z.object({ name: title, occasions, notes: note, asset: hashSchema.nullable().default(null), photos: photosSchema, items: z.array(z.object({ id, data: itemSchema }).strict()).max(30) }).strict().superRefine(validatePhotos)
  .refine(s => !!s.asset || s.items.length > 0, "日历快照需要照片或单品");
export const calendarSchema = z.object({ date: dateSchema, status: z.enum(["planned", "worn"]), outfitId: id, notes: note, snapshot: snapshotSchema }).strict();
export const subsetSchema = z.object({ name: title, scope: z.enum(["item", "outfit"]), root: z.enum(["all", "top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"]), parentId: id.nullable(), memberIds: z.array(id).max(2000).default([]) }).strict()
  .refine(data => new Set(data.memberIds).size === data.memberIds.length, "分组不能重复添加同一记录");
export type Subset = z.infer<typeof subsetSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Outfit = z.infer<typeof outfitSchema>;
export type CalendarEntry = z.infer<typeof calendarSchema>;
const metadata = { id, version: z.number().int().min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime() };
export const itemRecordSchema = z.object({ ...metadata, kind: z.literal("item"), data: itemSchema }).strict();
export const outfitRecordSchema = z.object({ ...metadata, kind: z.literal("outfit"), data: outfitSchema }).strict();
export const calendarRecordSchema = z.object({ ...metadata, kind: z.literal("calendar"), data: calendarSchema }).strict();
export const subsetRecordSchema = z.object({ ...metadata, kind: z.literal("subset"), data: subsetSchema }).strict();
export const personalSizesRecordSchema = z.object({ ...metadata, kind: z.literal("personalSizes"), data: personalSizesSchema }).strict();
export type PersonalSizesRecord = z.infer<typeof personalSizesRecordSchema>;
export type SubsetRecord = z.infer<typeof subsetRecordSchema>;
export const recordSchema = z.discriminatedUnion("kind", [itemRecordSchema, outfitRecordSchema, calendarRecordSchema, subsetRecordSchema, personalSizesRecordSchema]);
export type ItemRecord = z.infer<typeof itemRecordSchema>;
export type OutfitRecord = z.infer<typeof outfitRecordSchema>;
export type CalendarRecord = z.infer<typeof calendarRecordSchema>;
export type ClosetRecord = z.infer<typeof recordSchema>;
export const assetSchema = z.object({ hash: hashSchema, name: z.string().max(255), mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]), size: z.number().int().positive().max(20 * 1024 * 1024) }).strict();
export type Asset = z.infer<typeof assetSchema>;
export const archiveSchema = z.object({
  format: z.literal("new-closet"), schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]), exportedAt: z.string().datetime(), collection: z.object({ name: title }).strict(),
  records: z.array(recordSchema).max(2000), assets: z.array(assetSchema).max(2000),
}).strict();
export type ClosetArchive = z.infer<typeof archiveSchema>;
export type Collection = { id: string; name: string; createdAt: string };
export type ClosetState = { collections: Collection[]; collectionId: string; records: ClosetRecord[]; assets: Asset[] };
export function referencedAssets(records: ClosetRecord[]): Set<string> {
  const hashes = new Set<string>();
  for (const r of records) {
    if (r.kind === "item" || r.kind === "outfit") for (const hash of photoAssets(r.data)) hashes.add(hash);
    if (r.kind === "calendar") {
      for (const hash of photoAssets(r.data.snapshot)) hashes.add(hash);
      for (const i of r.data.snapshot.items) for (const hash of photoAssets(i.data)) hashes.add(hash);
    }
  }
  return hashes;
}
export function validateArchive(input: unknown): ClosetArchive {
  const a = archiveSchema.parse(input); const map = new Map(a.records.map(r => [r.id, r]));
  if (map.size !== a.records.length) throw new Error("记录 ID 重复");
  const media = new Set(a.assets.map(m => m.hash));
  if (media.size !== a.assets.length) throw new Error("图片标识重复");
  for (const r of a.records) {
    if (r.kind === "outfit") for (const itemId of r.data.itemIds) if (map.get(itemId)?.kind !== "item") throw new Error("搭配引用了不存在的单品");
    if (r.kind === "calendar") {
      if (map.get(r.data.outfitId)?.kind !== "outfit") throw new Error("日历引用了不存在的搭配");
      for (const i of r.data.snapshot.items) if (map.get(i.id)?.kind !== "item") throw new Error("日历快照缺少单品记录");
    }
  }
  for (const hash of referencedAssets(a.records)) if (!media.has(hash)) throw new Error("备份缺少原图");
  validateSubsets(a.records);
  if (a.records.filter(record => record.kind === "personalSizes").length > 1) throw new Error("每个衣橱只能保存一份我的尺码");
  return { ...a, schemaVersion: 7 };
}
export function makeSnapshot(outfit: Outfit, items: ItemRecord[]): CalendarEntry["snapshot"] {
  const map = new Map(items.map(i => [i.id, i]));
  return snapshotSchema.parse({ name: outfit.name, occasions: outfit.occasions, notes: outfit.notes, asset: outfit.asset, photos: [...photoAssets(outfit)],
    items: outfit.itemIds.map(itemId => { const item = map.get(itemId); if (!item) throw new Error("搭配中的单品不存在，请刷新重试"); return { id: item.id, data: item.data }; }) });
}
export function wardrobePrompt(state: ClosetState, request: string, locale = DEFAULT_LOCALE): string {
  return [messageForLocale(locale, "你是我的穿搭助手。仅使用以下真实衣橱中的单品，保留单品 ID，说明上身/下身/鞋履的比例、场合和舒适度。不虚构衣物。"), messageForLocale(locale, "我的需求：{request}", { request }),
    JSON.stringify(state.records.filter(r => r.kind === "item" && !r.data.archived).map(r => ({ id: r.id, ...r.data, asset: undefined, photos: undefined })), null, 2)
  ].join("\n\n");
}
export interface OutfitAdvisor {
  suggest(context: { items: ItemRecord[]; request: string }, signal?: AbortSignal): Promise<{ name: string; itemIds: string[]; explanation: string }[]>;
}
