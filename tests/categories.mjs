import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
await build({ entryPoints: ['lib/domain.ts','lib/i18n/core.ts'], outdir: '.test-runtime/categories-build', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, logLevel: 'error' });
const root = process.cwd() + '/.test-runtime/categories-build/';
const { CATEGORIES, itemSchema, outfitSchema } = require(root + 'domain.cjs');
const { translatedOptions, messageForLocale } = require(root + 'i18n/core.cjs');
// Default wardrobe order: everyday garments, then bags and accessories, one-pieces last.
assert.deepEqual(Object.keys(CATEGORIES), ['top','bottom','outerwear','shoes','bag','accessory','dress']);
const labels = translatedOptions(CATEGORIES, key => messageForLocale('en', key));
assert.deepEqual(Object.keys(labels), ['top','bottom','outerwear','shoes','bag','accessory','dress']);
assert.deepEqual(Object.values(labels), ['Tops','Bottoms','Outerwear','Shoes','Bags','Accessories','Dresses & one-pieces']);
assert.deepEqual(translatedOptions(CATEGORIES, key => messageForLocale('zh-CN', key)), { top: '上装', bottom: '下装', outerwear: '外套', shoes: '鞋履', bag: '包袋', accessory: '配饰', dress: '连体 / 裙装' });
// Every category keeps its item and outfit picker behaviour after reordering.
const item = { name: 'Sample', color: '', seasons: [], occasions: [], notes: '', asset: null, archived: false };
for (const category of Object.keys(CATEGORIES)) assert.equal(itemSchema.parse({ ...item, category }).category, category);
const outfit = { name: 'Look', itemIds: [], asset: 'a'.repeat(64), occasions: [], notes: '', archived: false };
assert.equal(outfitSchema.parse(outfit).asset, 'a'.repeat(64));
console.log('PASS: default category order is tops, bottoms, outerwear, shoes, bags, accessories, one-pieces in both locales, and every category stays selectable.');
