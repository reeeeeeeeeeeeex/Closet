import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { createServer } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

await mkdir('.test-runtime', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-runtime/ai-mcp-'));
const reserve = createNetServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening'); const port = reserve.address().port; await new Promise(r => reserve.close(r));
const base = `http://127.0.0.1:${port}`;
let server, cookie = '', owner = '', logs = '', pngHash, itemId, otherItemId;
const clients = [];
const captures = []; let mode = 'normal', fixtureError;
const model = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); captures.push({ path: request.url, headers: request.headers, body });
    if (mode === 'http-error') { response.writeHead(401).end(JSON.stringify({ error: 'never expose private provider content' })); return; }
    if (mode === 'invalid') { response.writeHead(200).end('invalid'); return; }
    if (mode === 'truncated') { response.writeHead(200).end(JSON.stringify({ choices: [{ finish_reason: 'length', message: { role: 'assistant', content: 'unfinished' } }] })); return; }
    if (mode === 'slow') { setTimeout(() => { if (!response.destroyed) response.writeHead(200).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'late' } }] })); }, 1000); return; }
    const anthropic = request.url.endsWith('/messages');
    const definitions = anthropic ? body.tools.map(t => t.name) : body.tools.map(t => t.function.name);
    const hasPhotos = definitions.includes('get_photos');
    const results = anthropic ? body.messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(b => b.type === 'tool_result') : []) : body.messages.filter(m => m.role === 'tool');
    let call;
    if (!results.length) call = { name: 'search_items', arguments: {} };
    else if (results.length === 1 && hasPhotos) call = { name: 'get_photos', arguments: { recordId: itemId } };
    if (call) {
      const id = 'call-' + (results.length + 1);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(anthropic ? { content: [{ type: 'tool_use', id, name: call.name, input: call.arguments }], stop_reason: 'tool_use' } : { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } }] })); return;
    }
    const resultStrings = JSON.stringify(results);
    assert.ok(resultStrings.includes(itemId)); assert.ok(!resultStrings.includes(otherItemId));
    if (hasPhotos) {
      const blocks = anthropic ? results.flatMap(r => r.content) : body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
      const image = blocks.find(b => b.type === (anthropic ? 'image' : 'image_url')); assert.ok(image, 'actual image must reach model request');
      const bytes = Buffer.from(anthropic ? image.source.data : image.image_url.url.split(',')[1], 'base64');
      const meta = await sharp(bytes).metadata(); assert.equal(meta.format, 'jpeg'); assert.ok(meta.width > 1);
      assert.ok(blocks.some(b => b.type === 'text' && b.text.includes(itemId)), 'image-to-item mapping must accompany pixels');
      if (anthropic) assert.equal(image.source.media_type, 'image/jpeg');
    }
    const answer = hasPhotos ? '已查看蓝色衬衫照片，适合通勤。' : '根据文字资料推荐蓝色衬衫。';
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(anthropic ? { content: [{ type: 'text', text: answer }], stop_reason: 'end_turn' } : { choices: [{ message: { role: 'assistant', content: answer } }] }));
  } catch (error) { fixtureError = error; response.writeHead(500).end('{}'); }
});
model.listen(0, '127.0.0.1'); await once(model, 'listening'); const modelBase = `http://127.0.0.1:${model.address().port}/v1`;
const request = (url, options = {}) => fetch(base + url, { ...options, headers: { Cookie: cookie, 'X-Closet-Profile': owner, ...options.headers } });
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
async function connection(scopes) { const r = await request('/api/mcp/connections', json('POST', { name: 'test-client', collectionId: 'main', scopes })); assert.equal(r.status, 200); return r.json(); }
async function client(token) { const c = new Client({ name: 'acceptance', version: '1.0' }); clients.push(c); await c.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + token } } })); return c; }
async function settings(provider = 'openai', scopes = ['read','photos'], apiKey = 'secret-fixture-key') {
  const r = await request('/api/ai/settings', json('POST', { provider, baseUrl: modelBase, model: 'fixture-vision', apiKey, scopes })); assert.equal(r.status, 200); const data = await r.json(); assert.equal(data.settings.hasKey, true); assert.ok(!JSON.stringify(data).includes('secret-fixture-key')); assert.equal(data.settings.apiKey, undefined); return data;
}
async function chat(signal) { const r = await request('/api/ai/chat', { ...json('POST', { collectionId: 'main', prompt: '查看我的照片并推荐通勤搭配。', history: [] }), signal }); assert.equal(r.status, 200); return (await r.text()).trim().split('\n').map(v => JSON.parse(v)); }
try {
  // Same production startup command as pnpm start, with isolated data and port.
  server = spawn(process.execPath, ['scripts/local-server.mjs','start'], { env: { ...process.env, CLOSET_PORT: String(port), CLOSET_HOST: '127.0.0.1', CLOSET_DATA_DIR: directory }, stdio: ['ignore','pipe','pipe'] });
  server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
  for (let i = 0; i < 100; i++) { if (server.exitCode !== null) throw Error(logs); try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const profiles = await fetch(base + '/api/profiles'); cookie = profiles.headers.get('set-cookie').split(';')[0]; owner = (await profiles.json()).current.id;
  const empty = await connection(['read']), emptyClient = await client(empty.token);
  assert.equal((await emptyClient.callTool({ name: 'search_items', arguments: {} })).structuredContent.total, 0, 'new empty wardrobe can connect');
  const png = await sharp({ create: { width: 96, height: 128, channels: 3, background: '#214f90' } }).png().toBuffer();
  const upload = new FormData(); upload.append('file', new File([png], '蓝衬衫.png', { type: 'image/png' })); const assetResponse = await request('/api/assets', { method: 'POST', body: upload }); assert.equal(assetResponse.status, 200); pngHash = (await assetResponse.json()).hash;
  const item = { name: '蓝衬衫', category: 'top', brand: 'Test', color: '蓝', seasons: ['autumn'], occasions: ['work'], notes: '', asset: pngHash, photos: [pngHash], archived: false };
  const saved = await request('/api/closet', json('POST', { op: 'save', collectionId: 'main', kind: 'item', data: item })); assert.equal(saved.status, 200); itemId = (await saved.json()).id;
  const sizes = await request('/api/closet', json('POST', { op: 'save', collectionId: 'main', kind: 'personalSizes', data: { measurements: { height: 175 } } })); assert.equal(sizes.status, 200);
  const full = await connection(['read','photos','sizes','write']), mcp = await client(full.token);
  const listed = await mcp.listTools(); assert.equal(listed.tools.length, 10);
  const found = await mcp.callTool({ name: 'search_items', arguments: { category: 'top', season: 'autumn' } }); assert.ok(JSON.stringify(found.structuredContent).includes(itemId));
  assert.equal((await mcp.callTool({ name: 'get_personal_sizes', arguments: {} })).structuredContent.sizes.data.measurements.height, 175);
  const images = await mcp.callTool({ name: 'get_photos', arguments: { recordId: itemId } }); assert.equal(images.content.filter(b => b.type === 'image').length, 1);
  const original = await request('/api/assets/' + pngHash); assert.deepEqual(Buffer.from(await original.arrayBuffer()), png, 'preview must not rewrite original');
  const writeId = randomUUID(), writeArgs = { requestId: writeId, name: '通勤搭配', itemIds: [itemId], occasions: ['work'] };
  const created = await mcp.callTool({ name: 'create_outfit', arguments: writeArgs }); assert.equal(created.isError, undefined);
  const repeated = await mcp.callTool({ name: 'create_outfit', arguments: writeArgs }); assert.equal(created.structuredContent.id, repeated.structuredContent.id, 'retry must not duplicate outfit');
  assert.equal((await mcp.callTool({ name: 'create_outfit', arguments: { ...writeArgs, name: 'Different' } })).isError, true);
  const planned = await mcp.callTool({ name: 'plan_outfit', arguments: { requestId: randomUUID(), outfitId: created.structuredContent.id, date: '2026-10-14' } }); assert.equal(planned.isError, undefined);
  const calendar = await mcp.callTool({ name: 'get_calendar', arguments: { from: '2026-10-14', to: '2026-10-14' } }); assert.equal(calendar.structuredContent.records[0].status, 'planned');
  const readOnly = await connection(['read']), restricted = await client(readOnly.token);
  assert.ok(!(await restricted.listTools()).tools.some(t => ['get_photos','get_personal_sizes','create_outfit'].includes(t.name)));
  assert.equal((await restricted.callTool({ name: 'get_photos', arguments: { recordId: itemId } })).isError, true);
  assert.equal((await fetch(base + '/mcp', json('POST', {}))).status, 401);
  assert.equal((await fetch(base + '/mcp', { ...json('POST', {}), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + full.token, Origin: 'https://evil.example' } })).status, 403);
  const oldCookie = cookie, oldOwner = owner;
  const switched = await request('/api/profiles', json('POST', { action: 'create', name: 'Other person' })); cookie = switched.headers.get('set-cookie').split(';')[0]; owner = (await switched.json()).profile.id;
  const other = await request('/api/closet', json('POST', { op: 'save', collectionId: 'main', kind: 'item', data: { ...item, name: 'Private other item', asset: null, photos: [] } })); otherItemId = (await other.json()).id;
  assert.equal((await request('/api/ai/settings')).status, 200); assert.equal((await (await request('/api/ai/settings')).json()).settings, null);
  assert.ok(!JSON.stringify(await mcp.callTool({ name: 'search_items', arguments: {} })).includes(otherItemId), 'browser account switch must not change MCP owner');
  assert.equal((await mcp.callTool({ name: 'get_item', arguments: { id: otherItemId } })).isError, true);
  assert.equal((await request('/api/ai/settings', { ...json('POST', { provider: 'openai', baseUrl: modelBase, model: 'x', apiKey: 'x', scopes: ['read'] }), headers: { 'Content-Type': 'application/json', 'X-Closet-Profile': oldOwner } })).status, 409);
  cookie = oldCookie; owner = oldOwner;
  const stdio = new Client({ name: 'stdio-acceptance', version: '1' }); clients.push(stdio);
  await stdio.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('scripts/mcp-stdio.mjs')], env: { ...process.env, CLOSET_MCP_TOKEN: full.token, CLOSET_MCP_URL: base + '/mcp' } })); assert.equal((await stdio.listTools()).tools.length, 10);
  assert.ok(JSON.stringify(await stdio.callTool({ name: 'search_items', arguments: {} })).includes(itemId));
  await settings('openai'); const events = await chat(); assert.equal(events.at(-1).type, 'answer'); assert.ok(events.some(e => e.type === 'tool_result' && e.imageCount === 1)); if (fixtureError) throw fixtureError;
  assert.equal(captures.find(c => c.path.endsWith('/chat/completions')).headers.authorization, 'Bearer secret-fixture-key');
  await settings('anthropic'); assert.equal((await chat()).at(-1).type, 'answer'); if (fixtureError) throw fixtureError;
  assert.equal(captures.find(c => c.path.endsWith('/messages')).headers['x-api-key'], 'secret-fixture-key');
  await settings('openai', ['read']); const noPhotos = await chat(); assert.ok(!noPhotos.some(e => e.type === 'tool' && e.name === 'get_photos')); if (fixtureError) throw fixtureError;
  const stored = new DatabaseSync(path.join(directory, 'closet.sqlite')); const encryptedKey = stored.prepare('SELECT encrypted_key FROM ai_settings WHERE owner=?').get(owner).encrypted_key; assert.ok(!encryptedKey.includes('secret-fixture-key')); assert.notEqual(stored.prepare('SELECT token_hash FROM mcp_connections WHERE id=?').get(full.connection.id).token_hash, full.token); stored.close();
  assert.equal((await request('/api/ai/settings', json('POST', { provider: 'anthropic', baseUrl: modelBase, model: 'x', scopes: ['read'] }))).status, 400, 'changing provider cannot silently reuse a key');
  mode = 'http-error'; const failed = await chat(); assert.equal(failed.at(-1).type, 'error'); assert.ok(!JSON.stringify(failed).includes('never expose'));
  mode = 'invalid'; assert.equal((await chat()).at(-1).type, 'error');
  mode = 'truncated'; assert.equal((await chat()).at(-1).type, 'error');
  mode = 'slow'; const controller = new AbortController(); const pending = chat(controller.signal); setTimeout(() => controller.abort(), 150); await assert.rejects(pending); await new Promise(r => setTimeout(r, 300));
  mode = 'normal'; assert.equal((await chat()).at(-1).type, 'answer');
  await request('/api/mcp/connections', json('DELETE', { id: full.connection.id })); await assert.rejects(mcp.listTools()); await assert.rejects(stdio.callTool({ name: 'search_items', arguments: {} }));
  const activity = await (await request('/api/mcp/connections')).json(); assert.ok(activity.activity.some(a => a.source === '内置 AI' && a.tool === 'get_photos')); assert.ok(activity.activity.every(a => !('arguments' in a)));
  if (process.argv.includes('--browser')) {
    mode = 'normal'; await settings('openai', ['read','photos']);
    await writeFile(path.resolve('.test-runtime/ai-browser.json'), JSON.stringify({ base, port, directory, modelBase }));
    console.log('Browser fixture ready: ' + base);
    // A file marker works in non-interactive shells as well as terminals.
    while (true) { try { await readFile(path.join(directory, 'browser-finished')); break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  }
  console.log('AI / MCP production checks passed: HTTP + stdio, owner isolation, image pixels, both model formats, permissions, write retries, cancellation and secrets.');
} catch (error) { if (fixtureError) console.error(fixtureError); console.error(logs); throw error; }
finally {
  for (const c of clients) await c.close().catch(() => {});
  model.closeAllConnections(); await new Promise(r => model.close(r));
  if (server?.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  }
  if (process.platform === 'win32') {
    const stopped = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/stop-services.ps1','-ExtraPorts',String(port)], { stdio: 'inherit' });
    if (stopped.status) process.exitCode = 1;
  }
}
