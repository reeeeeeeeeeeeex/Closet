import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

const { build } = require('esbuild');
await build({ entryPoints: ['lib/portable.ts', 'lib/domain.ts'], outdir: '.test-build', bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
const { exportArchive, inspectArchive, importArchive, hashBytes } = await import(pathToFileURL(process.cwd() + '/.test-build/portable.js'));
const { validateArchive, makeSnapshot } = await import(pathToFileURL(process.cwd() + '/.test-build/domain.js'));
const { unzipSync, zipSync, strToU8 } = require('fflate');
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=', 'base64'));
const hash = await hashBytes(png);
const metadata = () => ({ id: crypto.randomUUID(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const item = { ...metadata(), kind: 'item', data: { name: 'Original jacket', category: 'outerwear', color: 'pink', occasions: ['casual'], seasons: ['spring'], asset: hash, notes: 'Keep original bytes', archived: false } };
const outfit = { ...metadata(), kind: 'outfit', data: { name: 'Original outfit', itemIds: [item.id], occasions: ['casual'], notes: '', archived: false } };
const entry = { ...metadata(), kind: 'calendar', data: { date: '2026-10-09', status: 'worn', outfitId: outfit.id, notes: '', snapshot: makeSnapshot(outfit.data, [item]) } };
item.data.name = 'Changed jacket'; outfit.data.name = 'Changed outfit';
assert.equal(entry.data.snapshot.name, 'Original outfit'); assert.equal(entry.data.snapshot.items[0].data.name, 'Original jacket');
const state = { collections: [{ id: 'main', name: 'Round trip', createdAt: item.createdAt }], collectionId: 'main', records: [item, outfit, entry], assets: [{ hash, name: '原始照片.png', mime: 'image/png', size: png.length }] };
let written = null; let uploadCount = 0;
globalThis.fetch = async (url, init = {}) => {
  if (url === `/api/assets/${hash}`) return new Response(png);
  if (url === '/api/assets' && init.method === 'POST') { const file = init.body.get('file'); assert.deepEqual(new Uint8Array(await file.arrayBuffer()), png); uploadCount++; return Response.json(state.assets[0]); }
  if (url === '/api/closet' && init.method === 'PUT') { written = JSON.parse(init.body); return Response.json({ collectionId: 'restored' }); }
  throw new Error('Unexpected fetch ' + url);
};
const blob = await exportArchive(state, () => {});
const file = new File([blob], 'test.zip');
const manifest = await inspectArchive(file, () => {});
assert.deepEqual(manifest.records, state.records); assert.deepEqual(manifest.assets, state.assets);
assert.equal(await importArchive(file, manifest, () => {}), 'restored'); assert.equal(uploadCount, 1); assert.deepEqual(written.records, state.records);
const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
assert.deepEqual(files[`assets/${hash}.png`], png);
const corrupt = { ...files, [`assets/${hash}.png`]: strToU8('changed bytes') };
await assert.rejects(() => inspectArchive(new File([zipSync(corrupt)], 'bad.zip'), () => {}), /SHA-256/);
const missing = { ...files }; delete missing[`assets/${hash}.png`];
await assert.rejects(() => inspectArchive(new File([zipSync(missing)], 'missing.zip'), () => {}), /原图缺失/);
assert.throws(() => validateArchive({ ...manifest, schemaVersion: 2 }));
assert.throws(() => validateArchive({ ...manifest, records: [outfit] }), /不存在/);
assert.throws(() => validateArchive({ ...manifest, records: [...manifest.records, item] }), /重复/);
await rm('.test-build', { recursive: true, force: true });
console.log('PASS: exact original bytes + all records round trip; immutable calendar snapshots; corrupt/missing media, future version, duplicate IDs and broken references rejected.');
