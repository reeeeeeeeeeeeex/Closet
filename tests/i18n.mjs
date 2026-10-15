import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
await build({ entryPoints: ['lib/i18n/core.ts','lib/item-filter.ts'], outdir: '.test-runtime/i18n-build', outExtension: {'.js':'.cjs'}, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' });
const { catalogs, messageForLocale: translate, resolveLocale, savedClientLocale, importedWardrobeName } = require('../.test-runtime/i18n-build/i18n/core.cjs');
const { filterItems } = require('../.test-runtime/i18n-build/item-filter.cjs');
const template = JSON.parse(await readFile('lib/i18n/messages/locale.template.json', 'utf8'));
assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs['zh-CN']).sort());
assert.deepEqual(Object.keys(template).sort(), Object.keys(catalogs.en).sort());
const placeholders = text => [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]).sort();
for (const [key, value] of Object.entries(catalogs.en)) {
  for (const text of typeof value === 'string' ? [value] : Object.values(value)) {
    assert.ok(text.trim(), `Empty translation: ${key}`);
    assert.doesNotMatch(text, /[\u3400-\u9fff]/, `Untranslated English message: ${key}`);
    assert.deepEqual(placeholders(text), placeholders(key), `Changed placeholders: ${key}`);
  }
}
assert.equal(resolveLocale(), 'en');
assert.equal(resolveLocale('unsupported'), 'en');
assert.equal(resolveLocale('EN-gb'), 'en');
assert.equal(resolveLocale('ZH_cn'), 'zh-CN');
assert.equal(translate('en', '{count} 条记录', {count: 1}), '1 record');
assert.equal(translate('en', '{count} 条记录', {count: 2}), '2 records');
assert.equal(translate('en', '{value1} 件单品', {value1: 1, count: 1}), '1 item');
assert.equal(translate('en', '模型服务返回 429，请检查模型名、密钥、额度与工具/视觉支持'), 'The model service returned HTTP 429. Check the model name, API key, quota, and tool or vision support.');
assert.equal(translate('en', '原图下载失败 (503)'), 'Could not download the original photo (503).');
assert.equal(translate('zh-CN', '原图下载失败 (503)'), '原图下载失败 (503)');
assert.equal(translate('en', 'constructor'), 'constructor');
assert.equal(translate('en', 'Handwritten 名称'), 'Handwritten 名称');
assert.equal(translate('zh-CN', '我的衣橱'), '我的衣橱');
assert.equal(importedWardrobeName('My wardrobe', 'en'), 'My wardrobe · Imported');
assert.equal(importedWardrobeName('我的衣橱', 'zh-CN'), '我的衣橱 · 导入');
assert.equal(importedWardrobeName('x'.repeat(100), 'en').length, 100);
const previous = catalogs.en['我的衣橱'];
try { catalogs.en['我的衣橱']=''; assert.equal(translate('en','我的衣橱'), '我的衣橱'); }
finally { catalogs.en['我的衣橱']=previous; }
globalThis.localStorage = { getItem: () => 'zh-CN' };
assert.equal(savedClientLocale(), 'zh-CN');
globalThis.localStorage = { getItem: () => { throw Error('Storage disabled'); } };
assert.equal(savedClientLocale(), 'en');
delete globalThis.localStorage;
const items = [{id:'blue',kind:'item',data:{name:'蓝衬衫',brand:'',category:'top',notes:'保留原文',archived:false,occasions:[],color:'',colorStyle:{mode:'solid',values:[{name:'藏蓝',hex:'#29476f'}]}}}];
const before = JSON.stringify(items);
const filters = {category:'all',occasion:'all',archived:false,search:'navy',colors:[],members:null};
assert.deepEqual(filterItems(items, filters, (key,params)=>translate('en',key,params)).map(item=>item.id), ['blue']);
assert.equal(JSON.stringify(items), before, 'Searching must not rewrite saved content');
console.log('PASS: complete English catalog, interpolation, plurals, locale persistence and fallback, native errors, translated color search, and unchanged user data.');
