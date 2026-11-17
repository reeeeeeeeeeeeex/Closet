import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
await build({ entryPoints: ['lib/note-document.ts','lib/domain.ts'], outdir: '.test-runtime/note-document', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' });
const require = createRequire(import.meta.url);
const { noteDocument, notePlainText, noteAttachments } = require('../.test-runtime/note-document/note-document.cjs');
const { noteSchema } = require('../.test-runtime/note-document/domain.cjs');
const legacy = { name: 'Legacy', text: 'My notes\n第二行', scope: 'outfit', root: 'all', subsetId: null, attachments: [{ hash: 'a'.repeat(64), name: 'voice.wav' }] };
const content = noteDocument(legacy);
assert.equal(notePlainText(content), legacy.text);
assert.deepEqual(noteAttachments(content), legacy.attachments);
assert.deepEqual(noteSchema.parse(legacy), legacy);
assert.equal(noteSchema.parse({ ...legacy, content }).content.content.length, 3);
const rich = structuredClone(content);
rich.content[0].content[0].marks = [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '28px', color: '#1d4ed8' } }, { type: 'highlight', attrs: { color: '#fef08a' } }];
assert.deepEqual(noteSchema.parse({ ...legacy, content: rich }).content, rich);
for (const bad of [
  { type: 'constructor' },
  { type: '__proto__' },
  { type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] },
  { type: 'doc', content: [{ type: 'paragraph', attrs: { onclick: 'alert(1)' } }] },
  { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: 'url(https://example.com)' } }] }] }] },
]) assert.equal(noteSchema.safeParse({ ...legacy, content: bad }).success, false);
assert.equal(noteSchema.safeParse({ ...legacy, content, attachments: [] }).success, false);
assert.equal(noteSchema.safeParse({ ...legacy, content, text: 'Different' }).success, false);
assert.equal(noteSchema.safeParse({ ...legacy, content: { type: 'doc' } }).success, false);
console.log('PASS: legacy notes, rich formatting, inline attachments, plain-text consistency, and rejection of unsafe or invalid document nodes.');
