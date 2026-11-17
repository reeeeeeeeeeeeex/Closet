import { moveTo } from "./random-outfit";

/** Unranked entries keep their default order ahead of entries the user has arranged. */
export function applyOrder<T>(values: T[], order: readonly string[] | undefined, id: (value: T) => string): T[] {
  if (!order?.length) return values;
  const ranks = new Map(order.map((key, index) => [key, index]));
  return [...values].sort((a, b) => (ranks.get(id(a)) ?? -1) - (ranks.get(id(b)) ?? -1));
}

/** Reorder the visible entries within their slots so filters do not move hidden entries. */
export function moveVisible<T extends string>(ordered: T[], visible: string[], from: string, to: string): T[] {
  const visibleIds = new Set(visible);
  const current = ordered.filter(id => visibleIds.has(id));
  const next = moveTo(current, current.findIndex(id => id === from), current.findIndex(id => id === to));
  if (next === current) return ordered;
  let index = 0;
  return ordered.map(id => visibleIds.has(id) ? next[index++] : id);
}
