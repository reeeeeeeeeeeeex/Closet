import type { ItemRecord } from "./domain";
import { colorKey, isCommonColor, itemColorStyle, itemColorText, uniqueColors } from "./colors";
import type { Translate } from "./i18n/core";

export const wardrobeColors = (items: ItemRecord[]) => uniqueColors(items.flatMap(item => itemColorStyle(item.data).values));
export function filterItems(items: ItemRecord[], filters: { category: string; occasion: string; archived: boolean; search: string; colors: string[]; members: Set<string> | null }, t?: Translate) {
  const query = filters.search.trim().toLocaleLowerCase();
  return items.filter(item => (!filters.members || filters.members.has(item.id))
    && item.data.archived === filters.archived
    && (filters.category === "all" || item.data.category === filters.category)
    && (filters.occasion === "all" || item.data.occasions.some(value => value === filters.occasion))
    && (!filters.colors.length || itemColorStyle(item.data).values.some(color => filters.colors.includes(colorKey(color))))
    && [item.data.name, item.data.brand, itemColorText(item.data), item.data.notes, ...itemColorStyle(item.data).values.filter(isCommonColor).map(color => t?.(color.name) || "")].join(" ").toLocaleLowerCase().includes(query));
}
