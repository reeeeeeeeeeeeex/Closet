import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const require = createRequire(import.meta.url);
await build({ entryPoints: ['components/item-details.tsx','lib/domain.ts','lib/i18n/core.ts'], outdir: '.test-runtime/item-details-build', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', external: ['react','react-dom','react/jsx-runtime'], logLevel: 'error' });
const root = process.cwd() + '/.test-runtime/item-details-build/';
const { itemSchema, makeSnapshot } = require(root + 'lib/domain.cjs');
const { ItemLabels, ItemDetailsFields } = require(root + 'components/item-details.cjs');
const { messageForLocale, catalogs, resolveLocale } = require(root + 'lib/i18n/core.cjs');
const base = { name: 'Jacket', category: 'top', color: '', seasons: [], occasions: [], notes: '', asset: null, archived: false };
for (const category of ['top','bottom','dress','outerwear']) for (const fit of ['tight','fitted','regular','loose']) assert.equal(itemSchema.parse({ ...base, category, fit }).fit, fit);
const shirt = itemSchema.parse({ ...base, fit: 'fitted', measurements: { shoulderWidth: 42.5, chest: 96, length: 68 } });
const shoe = itemSchema.parse({ ...base, category: 'shoes', shoeFit: 'large', shoeSize: { eu: 38.5, cn: 240 } });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
assert.match(render(ItemLabels, { item: shirt }), /修身/); assert.match(render(ItemLabels, { item: shirt }), /肩宽 42.5 cm/);
assert.match(render(ItemLabels, { item: shoe }), /偏大/); assert.match(render(ItemLabels, { item: shoe }), /欧码 38.5/); assert.match(render(ItemLabels, { item: shoe }), /中国码 240 mm/);
assert.match(render(ItemDetailsFields, { item: shirt, onChange: () => {} }), /胸围/);
assert.doesNotMatch(render(ItemDetailsFields, { item: shoe, onChange: () => {} }), /肩宽/);
assert.throws(() => itemSchema.parse({ ...shoe, shoeSize: { eu: 38, cn: 242 } }));
assert.throws(() => itemSchema.parse({ ...base, measurements: { chest: -1 } }));
assert.throws(() => itemSchema.parse({ ...base, category: 'bottom', measurements: { shoulderWidth: 42 } }));
assert.throws(() => itemSchema.parse({ ...base, shoeFit: 'small' }));
assert.equal(itemSchema.parse(base).fit, null);
const record = { id: crypto.randomUUID(), kind: 'item', data: shirt, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const snapshot = makeSnapshot({ name: 'Look', asset: null, itemIds: [record.id], occasions: [], notes: '', archived: false }, [record]);
shirt.measurements.chest = 110; assert.equal(snapshot.items[0].data.measurements.chest, 96);
catalogs.en = { '{count} 条记录': { one: '{count} record', other: '{count} records' }, '欧码 {size}': 'EU size {size}', '{label} {value} cm': '{value} cm — {label}' };
assert.equal(messageForLocale('en','{count} 条记录',{ count: 1 }), '1 record');
assert.equal(messageForLocale('en','{count} 条记录',{ count: 2 }), '2 records');
assert.equal(messageForLocale('en','{label} {value} cm',{ label: 'Waist', value: 80 }), '80 cm — Waist');
assert.equal(messageForLocale('en','未填写'), '未填写'); assert.equal(resolveLocale('not-registered'), 'zh-CN');
assert.equal(messageForLocale('en','constructor'), 'constructor'); assert.equal(messageForLocale('en','__proto__'), '__proto__');
delete catalogs.en;
const sourceCatalog = JSON.parse(await readFile('lib/i18n/messages/zh-CN.json','utf8'));
const template = JSON.parse(await readFile('lib/i18n/messages/locale.template.json','utf8'));
assert.deepEqual(Object.keys(template).sort(), Object.keys(sourceCatalog).sort());
for (const file of ['components/closet.tsx','components/outfit-fields.tsx','components/item-details.tsx','components/subsets.tsx','app/login/login-form.tsx','lib/portable.ts']) {
  const source = ts.createSourceFile(file, await readFile(file,'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && ['t','tr'].includes(node.expression.getText(source)) && ts.isStringLiteral(node.arguments[0])) assert(Object.hasOwn(sourceCatalog,node.arguments[0].text), `${file}: missing catalog key ${node.arguments[0].text}`);
    if (ts.isJsxText(node)) assert(!/[\u3400-\u9fff]/.test(node.text), `${file}: untranslated JSX text`);
    ts.forEachChild(node,visit);
  }
  visit(source);
}
console.log('PASS: category-specific fits/dimensions and independent EU/CN shoe sizes; directly rendered tags; invalid category/value rejection; immutable measurement snapshots; native translation placeholders/plurals/fallback and frontend catalog coverage.');
