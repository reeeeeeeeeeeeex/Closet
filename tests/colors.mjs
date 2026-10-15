import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

await build({entryPoints:['lib/colors.ts','lib/color-library.ts','lib/domain.ts','lib/local-storage.ts','components/closet-cards.tsx'],outdir:'.test-runtime/colors-build',outExtension:{'.js':'.cjs'},bundle:true,platform:'node',format:'cjs',external:['react','react-dom','react/jsx-runtime'],logLevel:'error'});
const require=createRequire(import.meta.url),root=process.cwd()+'/.test-runtime/colors-build/';
const {COMMON_COLORS,colorKey,colorStyleSchema,createColorDraft,changeColorMode,draftColorStyle,itemColorStyle}=require(root+'lib/colors.cjs');
const {itemSchema,validateArchive,makeSnapshot}=require(root+'lib/domain.cjs');
const {LocalDatabase}=require(root+'lib/local-storage.cjs');
const {rememberColors,getColorLibrary}=require(root+'lib/color-library.cjs');
const {ItemCard}=require(root+'components/closet-cards.cjs');
const blue={name:'海蓝',hex:'#123456'},pink={name:'豆沙',hex:null},alt={name:'海蓝',hex:'#112233'};
const style={mode:'primary',values:[blue,pink,alt]};
const base={name:'Color test',category:'top',color:'',seasons:[],occasions:[],notes:'',asset:null,archived:false};
assert.equal(COMMON_COLORS.length,24);
assert.equal(new Set(COMMON_COLORS.map(colorKey)).size,24);
assert.equal(colorKey({name:' ＮＡＶＹ ',hex:'#ABCDEF'}),colorKey({name:'navy',hex:'#abcdef'}));
assert.throws(()=>colorStyleSchema.parse({mode:'solid',values:[blue,pink]}),/纯色/);
assert.throws(()=>colorStyleSchema.parse({mode:'colorblock',values:[blue]}),/至少/);
assert.throws(()=>colorStyleSchema.parse({mode:'primary',values:[blue,blue]}),/重复/);
for(const mode of ['solid','primary','colorblock'])assert.deepEqual(colorStyleSchema.parse({mode,values:[]}).values,[]);
assert.deepEqual(itemColorStyle({color:'蓝,白 / 手写颜色'}).values,[{name:'蓝,白 / 手写颜色',hex:null}]);
assert.equal(itemSchema.parse(base).colorStyle,undefined);
let draft=changeColorMode(createColorDraft(style),'solid');assert.equal(draft.needsChoice,true);assert.equal(changeColorMode(draft,draft.mode).needsChoice,true);
draft={...draft,primaryKey:colorKey(pink),needsChoice:false};assert.deepEqual(draftColorStyle(draft).values,[pink]);
draft=changeColorMode(draft,'colorblock');assert.deepEqual(draftColorStyle(draft).values,style.values);
draft=changeColorMode(draft,'primary');assert.equal(draft.needsChoice,true);
draft={...draft,primaryKey:colorKey(alt),needsChoice:false};assert.deepEqual(draftColorStyle(draft).values,[alt,blue,pink]);
const now=new Date().toISOString();const record={id:crypto.randomUUID(),kind:'item',version:1,createdAt:now,updatedAt:now,data:itemSchema.parse({...base,colorStyle:style})};
const snapshot=makeSnapshot({name:'Look',asset:null,itemIds:[record.id],occasions:[],notes:'',archived:false},[record]);
record.data.colorStyle.values[0].name='Changed';assert.equal(snapshot.items[0].data.colorStyle.values[0].name,'海蓝');
const card=renderToStaticMarkup(React.createElement(ItemCard,{item:record,onOpen:()=>{}}));assert.match(card,/Changed \+ 2 accent colors/);
for(let version=1;version<=9;version++){
 const archive=validateArchive({format:'new-closet',schemaVersion:version,exportedAt:now,collection:{name:'Test'},records:[],assets:[]});assert.equal(archive.schemaVersion,9);assert.deepEqual(archive.colorLibrary,[]);
}
const dir=await mkdtemp(path.resolve('.test-runtime/colors-db-'));
let db=new LocalDatabase(dir);
try {
 db.prepare('INSERT INTO collections VALUES (?,?,?,?)').bind('one','main','Legacy',now).run();
 db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)').bind('one','main',crypto.randomUUID(),'item',JSON.stringify({...base,color:'旧颜色,保留全文'}),1,now,now).run();
 assert.equal(getColorLibrary(db,'one')[0].name,'旧颜色,保留全文');
 db.transaction(()=>rememberColors(db,'one',[blue,pink,alt,blue,COMMON_COLORS[0]],now));
 assert.equal(getColorLibrary(db,'one').length,4);assert.deepEqual(getColorLibrary(db,'two'),[]);
 assert.throws(()=>db.transaction(()=>{rememberColors(db,'one',[{name:'Failed',hex:null}],now);throw Error('rollback');}));
 assert.ok(!getColorLibrary(db,'one').some(c=>c.name==='Failed'));
 db.transaction(()=>rememberColors(db,'one',[pink],'2099-01-01T00:00:00.000Z'));
 assert.equal(getColorLibrary(db,'one')[0].name,pink.name);
 db.close();db=new LocalDatabase(dir);assert.equal(getColorLibrary(db,'one').length,4);
} finally {db.close();}
console.log('PASS: 24 presets, optional/multiple colors, normalized identity, mode draft recovery, immutable snapshots, v1-v9 compatibility, color-library legacy seeding/account isolation/atomic rollback/recent ordering/restart persistence.');
