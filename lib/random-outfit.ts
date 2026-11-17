import { z } from "zod";
import type { Item, ItemRecord } from "./domain";

export const outfitRuleCategory = z.enum(["top", "bottom", "outerwear", "shoes", "bag", "accessory", "dress"]);
const categoryRuleSchema = z.object({
  category: outfitRuleCategory,
  itemIds: z.array(z.string().uuid()).max(2000).nullable(),
}).strict().refine(rule => !rule.itemIds || new Set(rule.itemIds).size === rule.itemIds.length, "候选单品不能重复");

export const randomOutfitRulesSchema = z.object({
  categories: z.array(categoryRuleSchema).max(outfitRuleCategory.options.length),
}).strict().refine(rules => new Set(rules.categories.map(rule => rule.category)).size === rules.categories.length, "随机穿搭分类不能重复");

export type RandomOutfitRules = z.infer<typeof randomOutfitRulesSchema>;
export type CategoryRule = RandomOutfitRules["categories"][number];

export function defaultOutfitRules(items: ItemRecord[]): RandomOutfitRules {
  const available = new Set(items.filter(item => !item.data.archived).map(item => item.data.category));
  const preferred: Item["category"][] = ["top", "bottom", "shoes"];
  if (available.has("dress") && (!available.has("top") || !available.has("bottom"))) preferred.splice(0, 2, "dress");
  const categories = preferred.filter(category => available.has(category));
  return { categories: (categories.length ? categories : [...available]).map(category => ({ category, itemIds: null })) };
}

export function outfitCandidates(rule: CategoryRule, items: ItemRecord[]): ItemRecord[] {
  const matching = items.filter(item => !item.data.archived && item.data.category === rule.category);
  if (!rule.itemIds) return matching;
  const byId = new Map(matching.map(item => [item.id, item]));
  return rule.itemIds.flatMap(id => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export function randomOutfit(rules: RandomOutfitRules, items: ItemRecord[], random = Math.random) {
  const itemIds: string[] = [];
  const emptyCategories: Item["category"][] = [];
  for (const rule of rules.categories) {
    const pool = outfitCandidates(rule, items);
    if (pool.length) itemIds.push(pool[Math.floor(random() * pool.length)].id);
    else emptyCategories.push(rule.category);
  }
  return { itemIds, emptyCategories };
}

export function moveTo<T>(values: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= values.length || to < 0 || to >= values.length) return values;
  const reordered = [...values];
  reordered.splice(to, 0, ...reordered.splice(from, 1));
  return reordered;
}
