import type { ClosetRecord, ItemRecord, OutfitRecord, Subset, SubsetRecord } from "./domain";

export function rootRecords(records: ClosetRecord[], scope: Subset["scope"], root: Subset["root"]): (ItemRecord | OutfitRecord)[] {
  return records.filter((record): record is ItemRecord | OutfitRecord => record.kind === scope && (root === "all" || record.kind === "item" && record.data.category === root));
}
export function validateSubsets(records: ClosetRecord[]) {
  const map = new Map(records.map(record => [record.id, record]));
  const subsets = records.filter((record): record is SubsetRecord => record.kind === "subset");
  for (const subset of subsets) {
    const data = subset.data;
    if (data.scope === "outfit" && data.root !== "all") throw new Error("搭配分组只能属于我的搭配");
    if (data.parentId) {
      const parent = map.get(data.parentId);
      if (!parent || parent.kind !== "subset") throw new Error("上级分组不存在");
      if (parent.data.scope !== data.scope || parent.data.root !== data.root) throw new Error("分组必须沿用上级分组的范围和分类");
    }
    const visited = new Set([subset.id]); let parentId = data.parentId;
    while (parentId) {
      if (visited.has(parentId)) throw new Error("分组不能形成循环嵌套");
      visited.add(parentId); const parent = map.get(parentId);
      if (!parent || parent.kind !== "subset") throw new Error("上级分组不存在");
      parentId = parent.data.parentId;
    }
    for (const id of data.memberIds) {
      const member = map.get(id);
      if (!member || member.kind !== data.scope) throw new Error("分组引用了不存在或类型不匹配的记录");
      if (data.root !== "all" && member.kind === "item" && member.data.category !== data.root) throw new Error("单品仍在原分类的分组中，请先移出分组再修改分类");
    }
  }
}
export function subsetMemberIds(records: ClosetRecord[], id: string): Set<string> {
  const subsets = records.filter((record): record is SubsetRecord => record.kind === "subset");
  const map = new Map(subsets.map(record => [record.id, record]));
  const children = new Map<string, string[]>();
  for (const subset of subsets) if (subset.data.parentId) children.set(subset.data.parentId, [...(children.get(subset.data.parentId) || []), subset.id]);
  const members = new Set<string>(); const visited = new Set<string>(); const pending = [id];
  while (pending.length) {
    const current = pending.pop()!; if (visited.has(current)) continue; visited.add(current);
    for (const member of map.get(current)?.data.memberIds || []) members.add(member);
    pending.push(...(children.get(current) || []));
  }
  return members;
}
export function subsetTrail(records: ClosetRecord[], id: string): SubsetRecord[] {
  const map = new Map(records.filter((record): record is SubsetRecord => record.kind === "subset").map(record => [record.id, record]));
  const trail: SubsetRecord[] = []; const seen = new Set<string>(); let current = map.get(id);
  while (current && !seen.has(current.id)) { seen.add(current.id); trail.unshift(current); current = current.data.parentId ? map.get(current.data.parentId) : undefined; }
  return trail;
}

export type SubsetSection = { subset: SubsetRecord; count: number; records: (ItemRecord | OutfitRecord)[]; children: SubsetSection[] };
/** Render each branch at its deepest membership; siblings retain independent memberships. */
export function subsetSections(records: ClosetRecord[], scope: Subset["scope"], root: Subset["root"], parentId: string | null, visible: (ItemRecord | OutfitRecord)[]) {
  const subsets = records.filter((record): record is SubsetRecord => record.kind === "subset" && record.data.scope === scope && record.data.root === root);
  const children = new Map<string | null, SubsetRecord[]>();
  for (const subset of subsets) children.set(subset.data.parentId, [...(children.get(subset.data.parentId) || []), subset]);
  const aggregate = new Map<string, Set<string>>();
  function members(subset: SubsetRecord): Set<string> {
    const found = aggregate.get(subset.id); if (found) return found;
    const ids = new Set(subset.data.memberIds); aggregate.set(subset.id, ids);
    for (const child of children.get(subset.id) || []) for (const id of members(child)) ids.add(id);
    return ids;
  }
  function build(parent: string | null, eligible: (ItemRecord | OutfitRecord)[]): { sections: SubsetSection[]; ungrouped: (ItemRecord | OutfitRecord)[] } {
    const grouped = new Set<string>();
    const sections = (children.get(parent) || []).map(subset => {
      const ids = members(subset); for (const id of ids) grouped.add(id);
      const contents = eligible.filter(record => ids.has(record.id));
      const nested = build(subset.id, contents);
      return { subset, count: contents.length, records: nested.ungrouped, children: nested.sections };
    });
    return { sections, ungrouped: eligible.filter(record => !grouped.has(record.id)) };
  }
  return build(parentId, visible);
}
