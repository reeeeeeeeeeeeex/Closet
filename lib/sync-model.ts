import { z } from "zod";
import { assetSchema, recordSchema, validateArchive, referencedAssets, type ClosetRecord } from "./domain";
import { colorKey, libraryColorSchema } from "./colors";

export const syncCollectionSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(100), createdAt: z.string().datetime(), records: z.array(recordSchema).max(2000) }).strict();
export const tombstoneSchema=z.object({collectionId:z.string().uuid(),id:z.string().uuid(),deletedAt:z.string().datetime()}).strict();
export const replicaSchema = z.object({ collections: z.array(syncCollectionSchema).max(200), assets: z.array(assetSchema).max(400000), colorLibrary: z.array(libraryColorSchema).max(20000), tombstones:z.array(tombstoneSchema).max(400000).default([]) }).strict();
export type Replica = z.infer<typeof replicaSchema>;
export type SyncCollection = Replica["collections"][number];
export const emptyReplica = (): Replica => ({ collections: [], assets: [], colorLibrary: [], tombstones:[] });
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const recordEqual = (a?: ClosetRecord, b?: ClosetRecord) => canonical(a ? { id: a.id, kind: a.kind, data: a.data } : null) === canonical(b ? { id: b.id, kind: b.kind, data: b.data } : null);
export function normalizeReplica(replica: Replica): Replica {
  const collections = replica.collections.map(c => ({ ...c, records: [...c.records].sort((a,b) => a.id.localeCompare(b.id)) })).sort((a,b) => a.id.localeCompare(b.id));
  const hashes = new Set(collections.flatMap(c => [...referencedAssets(c.records)]));
  return { collections, assets: replica.assets.filter(a => hashes.has(a.hash)).sort((a,b) => a.hash.localeCompare(b.hash)), colorLibrary: [...replica.colorLibrary].sort((a,b) => colorKey(a).localeCompare(colorKey(b))), tombstones:[...(replica.tombstones||[])].sort((a,b)=>(a.collectionId+a.id).localeCompare(b.collectionId+b.id)) };
}
export function validateReplica(input: unknown): Replica {
  const replica = replicaSchema.parse(input);
  if (new Set(replica.collections.map(c => c.id)).size !== replica.collections.length || new Set(replica.assets.map(a => a.hash)).size !== replica.assets.length) throw new Error("同步清单中存在重复标识");
  for (const c of replica.collections) {
    const hashes = referencedAssets(c.records);
    validateArchive({ format: "new-closet", schemaVersion: 9, exportedAt: c.createdAt, collection: { name: c.name }, records: c.records, assets: replica.assets.filter(a => hashes.has(a.hash)), colorLibrary: [] });
  }
  for(const deleted of replica.tombstones)if(replica.collections.find(c=>c.id===deleted.collectionId)?.records.some(r=>r.id===deleted.id))throw new Error('记录同时存在于资料和删除清单');
  return normalizeReplica(replica);
}
export type SyncConflict = { key: string; collectionId: string; collectionName: string; ids: string[]; local: ClosetRecord[]; remote: ClosetRecord[]; signature: string };
export type Resolution = { choice: "local" | "remote"; signature: string };
export type MergeResult = { local: Replica; remote: Replica; base: Replica; conflicts: SyncConflict[] };

/** Connected references are resolved together: never publish half a group move or broken snapshot. */
export function mergeReplicas(base: Replica, local: Replica, remote: Replica, resolutions: Record<string, Resolution> = {}): MergeResult {
  const output: MergeResult = { local: emptyReplica(), remote: emptyReplica(), base: emptyReplica(), conflicts: [] };
  const maps = [base, local, remote].map(r => new Map(r.collections.map(c => [c.id, c])));
  const collectionIds = [...new Set([...local.collections, ...remote.collections, ...base.collections].map(c => c.id))].sort();
  for (const collectionId of collectionIds) {
    const [bc, lc, rc] = maps.map(m => m.get(collectionId));
    const template = rc || lc || bc!;
    const [bm, lm, rm] = [bc, lc, rc].map(c => new Map((c?.records || []).map(r => [r.id,r])));
    const ids = [...new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])].sort();
    const parent = new Map(ids.map(id => [id,id]));
    const root = (id: string): string => { const p = parent.get(id); if (!p || p === id) return id; const r = root(p); parent.set(id,r); return r; };
    const join = (a: string,b: string) => { if (parent.has(b)) parent.set(root(a),root(b)); };
    let sizes: string | undefined;
    for (const r of [...bm.values(), ...lm.values(), ...rm.values()]) {
      if (r.kind === "outfit") r.data.itemIds.forEach(id => join(r.id,id));
      if (r.kind === "calendar") { join(r.id,r.data.outfitId); r.data.snapshot.items.forEach(i => join(r.id,i.id)); }
      if (r.kind === "subset") { if (r.data.parentId) join(r.id,r.data.parentId); r.data.memberIds.forEach(id => join(r.id,id)); }
      if (r.kind === "personalSizes") { if (sizes) join(r.id,sizes); sizes = r.id; }
    }
    const groups = new Map<string,string[]>();
    for (const id of ids) { const key = root(id); groups.set(key,[...(groups.get(key) || []),id]); }
    const left: ClosetRecord[] = [], right: ClosetRecord[] = [], common: ClosetRecord[] = [];
    for (const group of groups.values()) {
      let conflict = group.some(id => !recordEqual(lm.get(id),rm.get(id)) && !recordEqual(lm.get(id),bm.get(id)) && !recordEqual(rm.get(id),bm.get(id))) ||
        group.some(id=>!bm.has(id)&&((lm.has(id)&&(remote.tombstones||[]).some(t=>t.collectionId===collectionId&&t.id===id))||(rm.has(id)&&(local.tombstones||[]).some(t=>t.collectionId===collectionId&&t.id===id)))) ||
        (group.filter(id => lm.get(id)?.kind === "personalSizes" || rm.get(id)?.kind === "personalSizes").length > 1 && !group.every(id => recordEqual(lm.get(id),rm.get(id))));
      if (!conflict) {
        const candidate = group.flatMap(id => { const l=lm.get(id),r=rm.get(id),b=bm.get(id);const chosen=recordEqual(l,r)?r||l:recordEqual(l,b)?r:l;return chosen?[chosen]:[]; });
        const hashes = referencedAssets(candidate);
        try { validateArchive({format:'new-closet',schemaVersion:9,exportedAt:template.createdAt,collection:{name:template.name},records:candidate,assets:[...new Map([...local.assets,...remote.assets].map(a=>[a.hash,a])).values()].filter(a=>hashes.has(a.hash)),colorLibrary:[]}); }
        catch { conflict=true; }
      }
      const key = `${collectionId}:${group[0]}`;
      const localRecords = group.flatMap(id => lm.has(id) ? [lm.get(id)!] : []), remoteRecords = group.flatMap(id => rm.has(id) ? [rm.get(id)!] : []);
      const signature = canonical([localRecords,remoteRecords]);
      const resolution = resolutions[key]?.signature === signature ? resolutions[key] : undefined;
      if (conflict && !resolution) {
        output.conflicts.push({ key, collectionId, collectionName: template.name, ids: group, local: localRecords, remote: remoteRecords, signature });
        left.push(...localRecords); right.push(...remoteRecords); common.push(...group.flatMap(id => bm.has(id) ? [bm.get(id)!] : []));
        continue;
      }
      for (const id of group) {
        const l = lm.get(id), r = rm.get(id), b = bm.get(id);
        const chosen = conflict ? resolution!.choice === "local" ? l : r : recordEqual(l,r) ? r || l : recordEqual(l,b) ? r : l;
        if (chosen) { left.push(chosen); right.push(chosen); common.push(chosen); }
      }
    }
    // Collection deletion is not a v1 operation. Empty collections remain portable.
    output.local.collections.push({ ...template, records: left });
    output.remote.collections.push({ ...template, records: right });
    output.base.collections.push({ ...template, records: common });
  }
  const assets = [...new Map([...local.assets,...remote.assets].map(a => [a.hash,a])).values()];
  const colors = new Map<string, Replica["colorLibrary"][number]>();
  for (const c of [...remote.colorLibrary,...local.colorLibrary]) { const key = colorKey(c), old = colors.get(key); if (!old || c.usedAt > old.usedAt) colors.set(key,c); }
  const deleted = new Map([...(base.tombstones||[]),...(local.tombstones||[]),...(remote.tombstones||[])].map(t=>[t.collectionId+':'+t.id,t]));
  for(const c of base.collections)for(const r of c.records)if(!local.collections.find(l=>l.id===c.id)?.records.some(l=>l.id===r.id)||!remote.collections.find(l=>l.id===c.id)?.records.some(l=>l.id===r.id)){
    const key=c.id+':'+r.id;if(!deleted.has(key))deleted.set(key,{collectionId:c.id,id:r.id,deletedAt:new Date().toISOString()});
  }
  for (const side of [output.local,output.remote,output.base]) { side.assets = assets; side.colorLibrary = [...colors.values()]; side.tombstones=[...deleted.values()].filter(t=>!side.collections.find(c=>c.id===t.collectionId)?.records.some(r=>r.id===t.id)); }
  output.local = validateReplica(output.local); output.remote = validateReplica(output.remote);
  // The baseline is intentionally partial while a conflict is unresolved.
  output.base = normalizeReplica(output.base);
  return output;
}
export const replicaEqual = (a: Replica,b: Replica) => canonical(normalizeReplica(a)) === canonical(normalizeReplica(b));
