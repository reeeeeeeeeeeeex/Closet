import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';

const scratchRoot = path.resolve('.test-runtime');
await (await import('node:fs/promises')).mkdir(scratchRoot, { recursive: true });
const directory = await mkdtemp(path.join(scratchRoot, 'instance-'));
const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
const originalFetch = globalThis.fetch;
let server; let logs = ''; let cookie = '';
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exit = once(server, 'exit'); server.kill(); await exit;
}
async function start() {
  // Spawn Next directly: stopping the test owns exactly this process.
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, CLOSET_HOST: '127.0.0.1', CLOSET_DATA_DIR: directory, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await originalFetch(base + '/login')).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Server startup timed out: ' + logs);
}
const request = (url, options = {}, authenticated = true) => originalFetch(base + url, { ...options, headers: { ...(authenticated ? { Cookie: cookie } : {}), ...options.headers }, redirect: 'manual' });
const post = data => request('/api/closet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'save', collectionId: 'main', ...data }) });
const password = 'runtime-test-' + crypto.randomUUID();
const login = password => request('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password }) }, false);
try {
  await start();
  assert.equal((await request('/api/closet', {}, false)).status, 401);
  assert.equal((await request('/api/closet', { headers: { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'forged@example.invalid' } }, false)).status, 401);
  assert.equal((await request('/', {}, false)).headers.get('location'), '/login');
  let res = await login(password); assert.equal(res.status, 200, await res.clone().text());
  assert.match(res.headers.get('set-cookie'), /HttpOnly/i); cookie = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await login('wrong-password')).status, 401);
  assert.equal((await request('/api/closet', { headers: { Cookie: 'closet_session=forged' } })).status, 401);
  assert.equal((await request('/api/auth', { method: 'POST', headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })).status, 403);
  assert.equal((await request('/api/closet', { method: 'POST', headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.deepEqual((await (await request('/api/closet')).json()).records, []);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=', 'base64');
  const form = new FormData(); form.append('file', new File([png], '原图.png', { type: 'image/png' }));
  res = await request('/api/assets', { method: 'POST', body: form }); assert.equal(res.status, 200, await res.clone().text()); const asset = await res.json();
  res = await request('/api/assets/' + asset.hash); assert.deepEqual(Buffer.from(await res.arrayBuffer()), png); assert.match(res.headers.get('cache-control'), /private/);
  assert.equal((await request('/api/assets/' + asset.hash, {}, false)).status, 401);
  const photoData = { name: 'Photo without items', itemIds: [], asset: asset.hash, occasions: [], notes: '', archived: false };
  res = await post({ kind: 'calendar', data: { date: '2026-10-10', status: 'worn', notes: 'Direct photo', newOutfit: photoData } });
  assert.equal(res.status, 200, await res.clone().text()); const photoOutfitId = (await res.json()).outfitId;
  const photoState = await (await request('/api/closet')).json();
  assert.equal(photoState.records.length, 2); assert.equal(photoState.records.filter(r => r.kind === 'item').length, 0);
  const photoOutfit = photoState.records.find(r => r.id === photoOutfitId);
  const photoCalendar = photoState.records.find(r => r.kind === 'calendar');
  assert.deepEqual(photoOutfit.data.itemIds, []); assert.equal(photoCalendar.data.snapshot.asset, asset.hash);
  assert.deepEqual(photoCalendar.data.snapshot.items, []);
  assert.equal((await post({ kind: 'outfit', data: { ...photoData, asset: null } })).status, 400);
  assert.equal((await post({ kind: 'calendar', data: { date: '2026-10-11', status: 'worn', notes: '', newOutfit: { ...photoData, asset: 'f'.repeat(64) } } })).status, 400);
  assert.equal((await (await request('/api/closet')).json()).records.length, 2);
  const itemData = { name: 'Pink jacket', category: 'outerwear', color: 'pink', occasions: ['casual'], seasons: ['spring'], asset: asset.hash, notes: 'Original', archived: false };
  res = await post({ kind: 'item', data: itemData }); assert.equal(res.status, 200, await res.clone().text());
  let state = await (await request('/api/closet')).json(); const item = state.records.find(r => r.kind === 'item');
  const outfitData = { name: 'First outfit', itemIds: [item.id], occasions: ['casual'], notes: '', archived: false };
  assert.equal((await post({ kind: 'outfit', id: photoOutfit.id, version: photoOutfit.version, data: { ...photoData, itemIds: [item.id] } })).status, 200);
  res = await post({ kind: 'outfit', data: outfitData }); assert.equal(res.status, 200, await res.clone().text());
  state = await (await request('/api/closet')).json(); const outfit = state.records.find(r => r.kind === 'outfit' && r.id !== photoOutfitId);
  res = await post({ kind: 'calendar', data: { date: '2026-10-09', status: 'worn', outfitId: outfit.id, notes: 'Original day' } }); assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await post({ kind: 'item', id: item.id, version: item.version, data: { ...itemData, name: 'Changed jacket' } })).status, 200);
  assert.equal((await post({ kind: 'item', id: item.id, version: item.version, data: { ...itemData, name: 'Stale overwrite' } })).status, 409);
  assert.equal((await post({ kind: 'outfit', id: outfit.id, version: outfit.version, data: { ...outfitData, name: 'Archived edit', archived: true } })).status, 200);
  state = await (await request('/api/closet')).json(); const entry = state.records.find(r => r.kind === 'calendar' && r.id !== photoCalendar.id);
  const photoHistory = state.records.find(r => r.id === photoCalendar.id);
  assert.equal(photoHistory.data.snapshot.items.length, 0); assert.equal(photoHistory.data.snapshot.asset, asset.hash);
  assert.equal(entry.data.snapshot.name, 'First outfit'); assert.equal(entry.data.snapshot.items[0].data.name, 'Pink jacket');
  await stop(); await start();
  assert.deepEqual((await (await request('/api/closet')).json()).records, state.records);
  assert.deepEqual(Buffer.from(await (await request('/api/assets/' + asset.hash)).arrayBuffer()), png);
  await build({ entryPoints: ['lib/portable.ts', 'lib/local-storage.ts'], outdir: directory, bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { exportArchive, inspectArchive, importArchive } = await import(pathToFileURL(path.join(directory, 'portable.js')));
  globalThis.fetch = (url, init = {}) => request(url, init);
  const backup = new File([await exportArchive(state, () => {})], 'wardrobe.zip');
  const manifest = await inspectArchive(backup, () => {});
  const restoredId = await importArchive(backup, manifest, () => {});
  const restored = await (await request('/api/closet?collection=' + restoredId)).json(); assert.deepEqual(restored.records, state.records); assert.equal(restored.collections.length, 2);
  assert.deepEqual((await (await request('/api/closet?collection=main')).json()).records, state.records);
  const broken = { ...manifest, assets: [] };
  assert.equal((await request('/api/closet', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(broken) })).status, 400);
  assert.equal((await (await request('/api/closet')).json()).collections.length, 2);
  const { LocalDatabase } = await import(pathToFileURL(path.join(directory, 'local-storage.js')));
  const local = new LocalDatabase(directory);
  await assert.rejects(local.batch([local.prepare("INSERT INTO collections VALUES ('rollback','test','name','now')"), local.prepare("INSERT INTO collections VALUES ('rollback','test','duplicate','now')")]));
  assert.equal(await local.prepare("SELECT id FROM collections WHERE owner='rollback'").first(), null);
  local.prepare("UPDATE records SET data=json_remove(data, '$.asset') WHERE id=?").bind(outfit.id).run();
  local.prepare("UPDATE records SET data=json_remove(data, '$.snapshot.asset') WHERE id=?").bind(entry.id).run();
  const legacyRead = await (await request('/api/closet?collection=main')).json();
  assert.equal(legacyRead.records.find(r => r.id === outfit.id).data.asset, null);
  assert.equal(legacyRead.records.find(r => r.id === entry.id).data.snapshot.asset, null);
  local.close();
  res = await post({ kind: 'calendar', id: entry.id, version: entry.version, op: 'deleteCalendar' }); assert.equal(res.status, 200);
  assert.equal((await (await request('/api/closet?collection=main')).json()).records.some(r => r.id === entry.id), false);
  assert.equal((await (await request('/api/closet?collection=' + restoredId)).json()).records.some(r => r.id === entry.id), true);
  assert.match(await (await request('/')).text(), /我的衣橱/);
  const persisted = new DatabaseSync(path.join(directory, 'closet.sqlite'), { readOnly: true });
  const stored = persisted.prepare('SELECT storage_key FROM assets').get();
  assert.deepEqual(await readFile(path.join(directory, 'assets', stored.storage_key)), png); persisted.close();
  assert.equal((await request('/api/auth', { method: 'DELETE' })).status, 200);
  console.log('PASS: production Node server; authenticated CRUD; photo-only calendar + outfit creation; optional item association without changing historical photo snapshots; invalid photo writes leave no orphan outfit; legacy SQLite records; 409 conflicts, transaction rollback, restart persistence and ZIP export/import.');
} catch (error) { console.error(logs); throw error; }
finally {
  globalThis.fetch = originalFetch; await stop();
  // Keep failed-run directories for diagnostics; test data is always ignored by Git.
  if (!directory.startsWith(scratchRoot + path.sep)) throw new Error('Invalid test directory');
  // Windows may keep SQLite handles open until this process exits.
}
