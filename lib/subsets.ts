import type { ClosetRecord, ItemRecord, OutfitRecord, Subset, SubsetRecord } from "./domain";

export function rootRecords(records: ClosetRecord[], scope: Subset["scope"], root: Subset["root"]): (ItemRecord | OutfitRecord)[] {
  return records.filter((record): record is ItemRecord | OutfitRecord => record.kind === scope && (root === "all" || record.kind === "item" && record.data.category === root));
}
export function validateSubsets(records: ClosetRecord[]) {
  const map = new Map(records.map(record => [record.id, record]));
  const subsets = records.filter((record): record is SubsetRecord => record.kind === "subset");
  for (const subset of subsets) {
    const data = subset.data;
    if (data.scope === "outfit" && data.root !== "all") throw new Error("搭配子集只能属于搭配集");
    if (data.parentId) {
      const parent = map.get(data.parentId);
      if (!parent || parent.kind !== "subset") throw new Error("父子集不存在");
      if (parent.data.scope !== data.scope || parent.data.root !== data.root) throw new Error("子集必须沿用父集的范围和分类");
    }
    const visited = new Set([subset.id]); let parentId = data.parentId;
    while (parentId) {
      if (visited.has(parentId)) throw new Error("子集不能形成循环嵌套");
      visited.add(parentId); const parent = map.get(parentId);
      if (!parent || parent.kind !== "subset") throw new Error("父子集不存在");
      parentId = parent.data.parentId;
    }
    for (const id of data.memberIds) {
      const member = map.get(id);
      if (!member || member.kind !== data.scope) throw new Error("子集引用了不存在或类型不匹配的记录");
      if (data.root !== "all" && member.kind === "item" && member.data.category !== data.root) throw new Error("单品仍在原分类的子集中，请先移出子集再修改分类");
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
