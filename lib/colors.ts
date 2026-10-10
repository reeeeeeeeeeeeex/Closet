import { z } from "zod";

export const colorValueSchema = z.object({ name: z.string().trim().min(1, "请填写颜色名称").max(50, "颜色名称不能超过 50 个字符"), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色色值无效").transform(value => value.toLowerCase()).nullable() }).strict();
export type ColorValue = z.infer<typeof colorValueSchema>;
export const colorKey = (color: ColorValue) => JSON.stringify([color.name.trim().normalize("NFKC").toLowerCase(), color.hex?.toLowerCase() ?? null]);
export const colorStyleSchema = z.object({ mode: z.enum(["solid", "primary", "colorblock"]), values: z.array(colorValueSchema) }).strict().superRefine((style, ctx) => {
  if (style.mode === "solid" && style.values.length > 1) ctx.addIssue({ code: "custom", message: "纯色只能选择一种颜色" });
  if (style.mode === "colorblock" && style.values.length === 1) ctx.addIssue({ code: "custom", message: "拼色请至少选择两种颜色" });
  if (new Set(style.values.map(colorKey)).size !== style.values.length) ctx.addIssue({ code: "custom", message: "同一种颜色不能重复添加" });
});
export type ColorStyle = z.infer<typeof colorStyleSchema>;
export const libraryColorSchema = colorValueSchema.extend({ usedAt: z.string().datetime() });
export type LibraryColor = z.infer<typeof libraryColorSchema>;
export const COMMON_COLORS: ColorValue[] = [
  ["黑", "#222222"], ["白", "#ffffff"], ["浅灰", "#c8c8c8"], ["深灰", "#55585e"],
  ["米白", "#f0e7d1"], ["杏色", "#edc6a5"], ["卡其", "#c3ad83"], ["驼色", "#b58b62"],
  ["浅棕", "#b88b64"], ["深棕", "#634736"], ["红", "#c73c3c"], ["酒红", "#7b233b"],
  ["砖红", "#b45349"], ["橙", "#e68a42"], ["奶油黄", "#f4df93"], ["粉", "#e8b3c3"],
  ["豆沙粉", "#bd8293"], ["紫", "#9581b5"], ["蓝", "#3976b9"], ["天蓝", "#8abbe7"],
  ["雾霾蓝", "#889eb6"], ["藏蓝", "#29476f"], ["绿", "#608664"], ["墨绿", "#255953"],
].map(([name, hex]) => ({ name, hex }));
const presets = new Set(COMMON_COLORS.map(colorKey));
export const isCommonColor = (value: ColorValue) => presets.has(colorKey(value));
export function itemColorStyle(item: { color: string; colorStyle?: ColorStyle }): ColorStyle {
  return item.colorStyle ?? { mode: "solid", values: item.color.trim() ? [{ name: item.color, hex: null }] : [] };
}
export const itemColorText = (item: { color: string; colorStyle?: ColorStyle }) => itemColorStyle(item).values.map(value => value.name).join(" ");
export function uniqueColors(values: ColorValue[]): ColorValue[] {
  return [...new Map(values.map(value => [colorKey(value), value])).values()];
}

// Keep hidden colors only in this editor session, never in saved records.
export type ColorDraft = { mode: ColorStyle["mode"]; all: ColorValue[]; primaryKey: string | null; needsChoice: boolean };
export const createColorDraft = (style: ColorStyle): ColorDraft => ({ mode: style.mode, all: [...style.values], primaryKey: style.values[0] ? colorKey(style.values[0]) : null, needsChoice: false });
export function changeColorMode(draft: ColorDraft, mode: ColorStyle["mode"]): ColorDraft {
  return { ...draft, mode, needsChoice: mode !== "colorblock" && draft.all.length > 1 && mode !== draft.mode };
}
export function draftColorStyle(draft: ColorDraft): ColorStyle {
  const primary = draft.all.find(color => colorKey(color) === draft.primaryKey) ?? draft.all[0];
  const ordered = primary ? [primary, ...draft.all.filter(color => colorKey(color) !== colorKey(primary))] : [];
  return { mode: draft.mode, values: draft.mode === "colorblock" ? draft.all : draft.mode === "solid" ? ordered.slice(0, 1) : ordered };
}
