import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
await mkdir('.test-runtime', { recursive: true });
let calls = 0;
const server = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const anthropic = request.url.endsWith('/messages');
    assert.equal(anthropic ? request.headers['x-api-key'] : request.headers.authorization, anthropic ? 'android-fixture-key' : 'Bearer android-fixture-key');
    const results = anthropic ? body.messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(b => b.type === 'tool_result') : []) : body.messages.filter(m => m.role === 'tool');
    const search = results[0];
    let tool;
    if (!results.length) tool = { name: 'search_items', args: { query: 'AI native shirt' } };
    else if (results.length === 1) {
      const value = JSON.parse(anthropic ? search.content[0].text : search.content);
      assert.ok(value.records.length >= 1); tool = { name: 'get_photos', args: { recordId: value.records.at(-1).id } };
    }
    if (tool) { const id = 'native-' + results.length; response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(anthropic ? { content: [{ type: 'tool_use', id, name: tool.name, input: tool.args }], stop_reason: 'tool_use' } : { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } }] })); return; }
    const blocks = anthropic ? results.flatMap(r => r.content) : body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
    const image = blocks.find(b => b.type === (anthropic ? 'image' : 'image_url')); assert.ok(image);
    const bytes = Buffer.from(anthropic ? image.source.data : image.image_url.url.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata(); assert.equal(metadata.format, 'jpeg'); assert.ok(metadata.width >= 32);
    assert.ok(blocks.some(b => b.type === 'text' && b.text.includes('AI native shirt')));
    calls++; await writeFile('.test-runtime/android-ai-fixture-results.json', JSON.stringify({ completed: calls, lastProvider: anthropic ? 'anthropic' : 'openai', imageBytes: bytes.length, width: metadata.width, height: metadata.height }));
    const text = '手机本地 MCP 已读取真实照片，推荐蓝色衬衫通勤。';
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(anthropic ? { content: [{ type: 'text', text }], stop_reason: 'end_turn' } : { choices: [{ message: { role: 'assistant', content: text } }] }));
  } catch (error) { console.error(error.message); response.writeHead(500).end('{}'); }
});
server.listen(0, '0.0.0.0', async () => {
  const port = server.address().port;
  await writeFile('.test-runtime/android-ai-fixture.json', JSON.stringify({ port, modelBase: `http://10.0.2.2:${port}/v1` }));
  console.log('Android AI fixture on ' + port);
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
