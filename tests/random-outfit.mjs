import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

await build({ entryPoints: ['lib/random-outfit.ts', 'lib/sync-model.ts'], outdir: '.test-runtime/random-outfit', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' });
const require = createRequire(import.meta.url);
const { randomOutfit, outfitCandidates, randomOutfitRulesSchema, moveTo } = require('../.test-runtime/random-outfit/random-outfit.cjs');
const { emptyReplica, mergeReplicas } = require('../.test-runtime/random-outfit/sync-model.cjs');
const item = (category, archived = false) => ({ id: crypto.randomUUID(), data: { category, archived } });
const first = item('top'), second = item('top'), shoes = item('shoes'), archived = item('top', true);
const items = [first, second, shoes, archived];
const top = { category: 'top', itemIds: [second.id, archived.id, first.id, shoes.id] };
const footwear = { category: 'shoes', itemIds: null };
assert.deepEqual(outfitCandidates(top, items).map(candidate => candidate.id), [second.id, first.id]);
assert.deepEqual(randomOutfit({ categories: [top, footwear] }, items, () => 0).itemIds, [second.id, shoes.id]);
const reordered = { categories: moveTo([top, footwear], 0, 1) };
assert.deepEqual(randomOutfit(reordered, items, () => 0.99).itemIds, [shoes.id, first.id]);
assert.deepEqual(randomOutfit({ categories: [{ ...top, itemIds: [] }] }, items).emptyCategories, ['top']);
assert.throws(() => randomOutfitRulesSchema.parse({ categories: [top, top] }), /分类不能重复/);
assert.throws(() => randomOutfitRulesSchema.parse({ categories: [{ ...top, itemIds: [first.id, first.id] }] }), /候选单品不能重复/);

const now = new Date().toISOString(), collectionId = crypto.randomUUID();
const replica = data => {
  const record = { id: crypto.randomUUID(), kind: 'randomOutfitRules', version: 1, createdAt: now, updatedAt: now, data };
  return { ...emptyReplica(), collections: [{ id: collectionId, name: 'Main', createdAt: now, records: [record] }] };
};
const local = replica({ categories: [top, footwear] }), remote = replica(reordered);
const { conflicts } = mergeReplicas(emptyReplica(), local, remote);
assert.equal(conflicts.length, 1);
const resolved = mergeReplicas(emptyReplica(), local, remote, { [conflicts[0].key]: { signature: conflicts[0].signature, choice: 'remote' } });
assert.deepEqual(resolved.local.collections[0].records[0].data, reordered);
assert.equal(resolved.local.collections[0].records.length, 1);
console.log('PASS: ordered categories and item candidates, eligible draws, duplicate protection, and synchronized rule conflicts.');
