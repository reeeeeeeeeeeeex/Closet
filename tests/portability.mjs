import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

const { build } = require('esbuild');
await build({ entryPoints: ['lib/portable.ts', 'lib/domain.ts', 'lib/calendar.ts'], outdir: '.test-build', bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
const { exportArchive, inspectArchive, importArchive, hashBytes } = await import(pathToFileURL(process.cwd() + '/.test-build/portable.js'));
const { validateArchive, makeSnapshot, itemSchema, outfitSchema, referencedAssets } = await import(pathToFileURL(process.cwd() + '/.test-build/domain.js'));
const { dayInMonth } = await import(pathToFileURL(process.cwd() + '/.test-build/calendar.js'));
assert.equal(dayInMonth('2026-01-31', 2026, 1), '2026-02-28');
assert.equal(dayInMonth('2024-01-31', 2024, 1), '2024-02-29');
assert.equal(dayInMonth('2026-10-09', 2030, 5), '2030-06-09');
const { unzipSync, zipSync, strToU8 } = require('fflate');
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=', 'base64'));
const hash = await hashBytes(png);
const metadata = () => ({ id: crypto.randomUUID(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const item = { ...metadata(), kind: 'item', data: itemSchema.parse({ name: 'Original jacket', category: 'outerwear', color: 'pink', occasions: ['casual'], seasons: ['spring'], asset: hash, notes: 'Keep original bytes', archived: false, fit: 'fitted', measurements: { shoulderWidth: 42.5, chest: 96, length: 68 } }) };
const outfit = { ...metadata(), kind: 'outfit', data: { name: 'Original outfit', itemIds: [item.id], asset: null, occasions: ['casual'], notes: '', archived: false } };
const entry = { ...metadata(), kind: 'calendar', data: { date: '2026-10-09', status: 'worn', outfitId: outfit.id, notes: '', snapshot: makeSnapshot(outfit.data, [item]) } };
item.data.name = 'Changed jacket'; item.data.measurements.chest = 100; outfit.data.name = 'Changed outfit';
assert.equal(entry.data.snapshot.name, 'Original outfit'); assert.equal(entry.data.snapshot.items[0].data.name, 'Original jacket');
assert.equal(entry.data.snapshot.items[0].data.measurements.chest, 96); assert.equal(entry.data.snapshot.items[0].data.fit, 'fitted');
const outfitPhoto = new Uint8Array([...png, ...strToU8('original outfit photo')]); const photoHash = await hashBytes(outfitPhoto);
const photoOnly = { ...metadata(), kind: 'outfit', data: { name: 'Photo only', itemIds: [], asset: photoHash, occasions: [], notes: '', archived: false } };
const photoEntry = { ...metadata(), kind: 'calendar', data: { date: '2026-10-10', status: 'worn', outfitId: photoOnly.id, notes: '', snapshot: makeSnapshot(photoOnly.data, []) } };
photoOnly.data.asset = hash; photoOnly.data.itemIds = [item.id];
assert.equal(photoEntry.data.snapshot.asset, photoHash); assert.equal(photoEntry.data.snapshot.items.length, 0);
assert(referencedAssets([photoOnly, photoEntry]).has(photoHash));
assert.throws(() => outfitSchema.parse({ ...photoOnly.data, itemIds: [], asset: null }), /照片/);
const state = { collections: [{ id: 'main', name: 'Round trip', createdAt: item.createdAt }], collectionId: 'main', records: [item, outfit, entry, photoOnly, photoEntry], assets: [{ hash, name: '原始照片.png', mime: 'image/png', size: png.length }, { hash: photoHash, name: '穿搭原图.png', mime: 'image/png', size: outfitPhoto.length }] };
let written = null; let uploadCount = 0;
globalThis.fetch = async (url, init = {}) => {
  if (url === `/api/assets/${hash}`) return new Response(png);
  if (url === `/api/assets/${photoHash}`) return new Response(outfitPhoto);
  if (url === '/api/assets' && init.method === 'POST') { const file = init.body.get('file'); const bytes = new Uint8Array(await file.arrayBuffer()); const saved = await hashBytes(bytes); assert.deepEqual(bytes, saved === hash ? png : outfitPhoto); uploadCount++; return Response.json(state.assets.find(a => a.hash === saved)); }
  if (url === '/api/closet' && init.method === 'PUT') { written = JSON.parse(init.body); return Response.json({ collectionId: 'restored' }); }
  throw new Error('Unexpected fetch ' + url);
};
const blob = await exportArchive(state, () => {});
const file = new File([blob], 'test.zip');
const manifest = await inspectArchive(file, () => {});
assert.deepEqual(manifest.records, state.records); assert.deepEqual(manifest.assets, state.assets);
assert.equal(manifest.schemaVersion, 4);
assert.equal(await importArchive(file, manifest, () => {}), 'restored'); assert.equal(uploadCount, 2); assert.deepEqual(written.records, state.records);
const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
assert.deepEqual(files[`assets/${hash}.png`], png);
assert.deepEqual(files[`assets/${photoHash}.png`], outfitPhoto);
const corrupt = { ...files, [`assets/${hash}.png`]: strToU8('changed bytes') };
await assert.rejects(() => inspectArchive(new File([zipSync(corrupt)], 'bad.zip'), () => {}), /SHA-256/);
const missing = { ...files }; delete missing[`assets/${hash}.png`];
await assert.rejects(() => inspectArchive(new File([zipSync(missing)], 'missing.zip'), () => {}), /原图缺失/);
assert.throws(() => validateArchive({ ...manifest, schemaVersion: 5 }));
assert.throws(() => validateArchive({ ...manifest, assets: [state.assets[0]] }), /缺少原图/);
const legacy = { ...manifest, schemaVersion: 1, records: structuredClone([item, outfit, entry]), assets: [state.assets[0]] };
delete legacy.records[1].data.asset; delete legacy.records[2].data.snapshot.asset;
for (const data of [legacy.records[0].data, legacy.records[2].data.snapshot.items[0].data]) for (const key of ['fit','shoeFit','shoeSize','measurements']) delete data[key];
for (const version of [1,2,3]) {
  const upgraded = validateArchive({ ...legacy, schemaVersion: version }); assert.equal(upgraded.schemaVersion, 4); assert.equal(upgraded.records[1].data.asset, null); assert.equal(upgraded.records[2].data.snapshot.asset, null);
  assert.equal(upgraded.records[0].data.fit, null); assert.deepEqual(upgraded.records[0].data.shoeSize, { eu: null, cn: null }); assert.deepEqual(upgraded.records[0].data.measurements, {});
}
assert.throws(() => validateArchive({ ...manifest, records: [outfit] }), /不存在/);
assert.throws(() => validateArchive({ ...manifest, records: [...manifest.records, item] }), /重复/);
await rm('.test-build', { recursive: true, force: true });
console.log('PASS: exact item/outfit original bytes + all records round trip; immutable photo-only snapshots; legacy v1 backup upgrade; leap-year month jumps; corrupt/missing media, future version, duplicate IDs and broken references rejected.');
