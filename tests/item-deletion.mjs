import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
await build({ entryPoints: ['lib/domain.ts','lib/mutations.ts','lib/brands.ts'], outdir: '.test-runtime/item-deletion-build', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, logLevel: 'error' });
const root = process.cwd() + '/.test-runtime/item-deletion-build/';
const { itemSchema, outfitSchema, subsetSchema, makeSnapshot, validateArchive, referencedAssets } = require(root + 'domain.cjs');
const { mutateRecords, MutationError } = require(root + 'mutations.cjs');
const { itemBrands } = require(root + 'brands.cjs');
const iso = () => new Date().toISOString();
const meta = (version = 1) => ({ id: crypto.randomUUID(), version, createdAt: iso(), updatedAt: iso() });
const itemData = (name, extra = {}) => itemSchema.parse({ name, category: 'top', color: '', seasons: [], occasions: [], notes: '', asset: null, archived: false, ...extra });
const outfitData = (name, itemIds, extra = {}) => outfitSchema.parse({ name, itemIds, asset: null, occasions: [], notes: '', archived: false, ...extra });
const archive = records => validateArchive({ format: 'new-closet', schemaVersion: 10, exportedAt: iso(), collection: { name: 'Main' }, records, assets });
const outfitPhotoHash = 'a'.repeat(64), itemPhotoHash = 'b'.repeat(64);
const assets = [
  { hash: outfitPhotoHash, name: 'outfit.png', mime: 'image/png', size: 10 },
  { hash: itemPhotoHash, name: 'item.png', mime: 'image/png', size: 10 },
];
const target = { ...meta(), kind: 'item', data: itemData('Delete me', { brand: 'Solo brand', asset: itemPhotoHash, photos: [itemPhotoHash] }) };
const shared = { ...meta(), kind: 'item', data: itemData('Keep me', { brand: 'Shared brand' }) };
const outfitKeep = { ...meta(), kind: 'outfit', data: outfitData('Keeps another item', [target.id, shared.id]) };
const outfitEmpty = { ...meta(), kind: 'outfit', data: outfitData('Only the deleted item', [target.id]) };
const outfitPhoto = { ...meta(), kind: 'outfit', data: outfitData('Photo look', [target.id], { asset: outfitPhotoHash }) };
const subsetItem = { ...meta(), kind: 'subset', data: subsetSchema.parse({ name: 'Tops group', scope: 'item', root: 'all', parentId: null, memberIds: [target.id, shared.id] }) };
const subsetOutfit = { ...meta(), kind: 'subset', data: subsetSchema.parse({ name: 'Outfit group', scope: 'outfit', root: 'all', parentId: null, memberIds: [outfitEmpty.id, outfitPhoto.id] }) };
const calendar = { ...meta(), kind: 'calendar', data: { date: '2026-10-09', status: 'worn', outfitId: outfitEmpty.id, notes: 'Old day', snapshot: makeSnapshot(outfitEmpty.data, [target, shared]) } };
const records = [target, shared, outfitKeep, outfitEmpty, outfitPhoto, subsetItem, subsetOutfit, calendar];
assert.doesNotThrow(() => archive(records));
assert.deepEqual(itemBrands(records.filter(record => record.kind === 'item')), ['Shared brand','Solo brand']);

const deleted = mutateRecords(records, { op: 'deleteItem', collectionId: 'main', kind: 'item', id: target.id, version: target.version }, assets);
const after = deleted.records;
assert.deepEqual(deleted.result.removedOutfits, [outfitEmpty.id]);
assert.equal(after.some(record => record.id === target.id), false);
assert.equal(after.some(record => record.id === outfitEmpty.id), false);
assert.equal(after.length, records.length - 2);
const keptOutfit = after.find(record => record.id === outfitKeep.id);
assert.deepEqual(keptOutfit.data.itemIds, [shared.id]); assert.equal(keptOutfit.version, 2);
const photoOutfit = after.find(record => record.id === outfitPhoto.id);
assert.deepEqual(photoOutfit.data.itemIds, []); assert.equal(photoOutfit.version, 2); assert.equal(photoOutfit.data.asset, outfitPhotoHash);
assert.deepEqual(after.find(record => record.id === subsetItem.id).data.memberIds, [shared.id]);
assert.equal(after.find(record => record.id === subsetItem.id).version, 2);
assert.deepEqual(after.find(record => record.id === subsetOutfit.id).data.memberIds, [outfitPhoto.id]);
assert.equal(after.find(record => record.id === subsetOutfit.id).version, 2);
const keptCalendar = after.find(record => record.id === calendar.id);
assert.equal(keptCalendar.version, calendar.version);
assert.deepEqual(keptCalendar.data, calendar.data);
// The brand suggestion list follows the remaining items: the unique brand disappears, the shared one stays.
assert.deepEqual(itemBrands(after.filter(record => record.kind === 'item')), ['Shared brand']);
assert(!itemBrands(after.filter(record => record.kind === 'item')).includes('Solo brand'));
// The deleted item's photos stay referenced by the untouched calendar snapshot, so backups remain complete.
assert(referencedAssets(after).has(itemPhotoHash));
assert.doesNotThrow(() => archive(after));
// A calendar entry whose outfit was emptied keeps its snapshot and stays editable.
const resaved = mutateRecords(after, { op: 'save', collectionId: 'main', kind: 'calendar', id: keptCalendar.id, version: keptCalendar.version, data: { date: '2026-10-10', status: 'planned', outfitId: keptCalendar.data.outfitId, notes: 'Updated' } }, assets);
const resavedCalendar = resaved.records.find(record => record.id === calendar.id);
assert.equal(resavedCalendar.data.notes, 'Updated'); assert.equal(resavedCalendar.data.status, 'planned');
assert.deepEqual(resavedCalendar.data.snapshot, keptCalendar.data.snapshot);
const expectMutation = (input, status, pattern) => assert.throws(() => mutateRecords(after, input, assets), error => error instanceof MutationError && error.status === status && pattern.test(error.message));
expectMutation({ op: 'deleteItem', collectionId: 'main', kind: 'item', id: target.id, version: target.version }, 404, /不存在/);
expectMutation({ op: 'deleteItem', collectionId: 'main', kind: 'outfit', id: keptOutfit.id, version: keptOutfit.version }, 400, /只能删除单品/);
expectMutation({ op: 'deleteItem', collectionId: 'main', kind: 'item', id: shared.id, version: shared.version + 1 }, 409, /另一台设备已修改/);
expectMutation({ op: 'save', collectionId: 'main', kind: 'calendar', data: { date: '2026-10-11', status: 'worn', outfitId: outfitEmpty.id, notes: '' } }, 400, /有效搭配/);
// Archived items can be deleted too, and an unrelated item is left byte-for-byte unchanged.
const archivedItem = { ...meta(), kind: 'item', data: itemData('Archived', { archived: true, brand: 'Archived brand' }) };
const archivedState = { records: mutateRecords([...after, archivedItem], { op: 'deleteItem', collectionId: 'main', kind: 'item', id: archivedItem.id, version: 1 }, assets).records };
assert.equal(archivedState.records.some(record => record.id === archivedItem.id), false);
const untouched = archivedState.records.find(record => record.id === shared.id);
assert.deepEqual(untouched, shared);
// Deleted ids stay allowed, but a surviving record of the wrong kind is still rejected.
const wrongOutfit = { ...keptCalendar, data: { ...keptCalendar.data, outfitId: shared.id } };
assert.throws(() => archive(after.map(record => record.id === keptCalendar.id ? wrongOutfit : record)), /不是搭配/);
const wrongSnapshot = structuredClone(keptCalendar);
wrongSnapshot.data.snapshot.items[0].id = keptOutfit.id;
assert.throws(() => archive(after.map(record => record.id === keptCalendar.id ? wrongSnapshot : record)), /不是单品/);
console.log('PASS: deleting an item unlinks outfits and groups, drops outfits left with no items or photos, keeps calendar snapshots editable and brands in sync, and blocks stale, mismatched or cross-kind deletions and references.');
