import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

const directory=await mkdtemp(path.resolve('.test-runtime/color-instance-'));
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const base=`http://127.0.0.1:${port}`;let server,logs='';
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,CLOSET_HOST:'127.0.0.1',CLOSET_DATA_DIR:directory,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/login')).status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error(logs);}
async function stop(){if(server?.exitCode===null){const done=once(server,'exit');server.kill();await done;}}
const req=(cookie,method,body,query='')=>fetch(base+'/api/closet'+query,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const get=async(cookie,id)=>{const response=await req(cookie,'GET',undefined,id?'?collection='+id:'');assert.equal(response.status,200);return response.json();};
const data={name:'Colors',category:'top',color:'',seasons:[],occasions:[],notes:'',asset:null,archived:false};
const blue={name:'海蓝',hex:'#123456'},cream={name:'浅奶油',hex:'#fffedc'},purple={name:'烟灰紫',hex:'#9988aa'};
async function account(username){const r=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'register',username,password:'1'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const save=(cookie,details)=>req(cookie,'POST',{op:'save',kind:'item',collectionId:'main',data,...details});
const archive=(records=[],colorLibrary=[])=>({format:'new-closet',schemaVersion:9,exportedAt:new Date().toISOString(),collection:{name:'Imported'},records,assets:[],colorLibrary});
try {
 await start();const first=await account('colors-one'),second=await account('colors-two');
 assert.deepEqual((await get(first)).colorLibrary,[]);
 let r=await save(first,{data:{...data,colorStyle:{mode:'primary',values:[blue,cream]}}});assert.equal(r.status,200,await r.clone().text());
 let state=await get(first);const item=state.records[0];assert.equal(item.data.color,blue.name);assert.equal(state.colorLibrary.length,2);
 assert.deepEqual((await get(second)).colorLibrary,[]);
 r=await req(first,'PUT',archive());assert.equal(r.status,200);const collectionId=(await r.json()).collectionId;
 assert.equal((await get(first,collectionId)).colorLibrary.length,2);
 assert.equal((await save(first,{id:item.id,version:0,data:{...data,colorStyle:{mode:'solid',values:[purple]}}})).status,400);
 const saves=await Promise.all([
   save(first,{id:item.id,version:1,data:{...data,colorStyle:{mode:'solid',values:[blue]}}}),
   save(first,{id:item.id,version:1,data:{...data,colorStyle:{mode:'solid',values:[cream]}}})]);
 assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
 assert.equal((await save(first,{id:item.id,version:1,data:{...data,colorStyle:{mode:'solid',values:[purple]}}})).status,409);
 assert.ok(!(await get(first)).colorLibrary.some(c=>c.name===purple.name));
 assert.equal((await save(first,{data:{...data,colorStyle:{mode:'colorblock',values:[blue]}}})).status,400);
 assert.equal((await save(first,{data:{...data,colorStyle:{mode:'colorblock',values:[blue,purple]}}})).status,200);
 state=await get(first);const exportData=archive(state.records,state.colorLibrary);
 r=await req(second,'PUT',exportData);assert.equal(r.status,200);const restored=await get(second,(await r.json()).collectionId);
 assert.deepEqual(restored.records,state.records);assert.deepEqual(restored.colorLibrary,state.colorLibrary);
 const before=state.colorLibrary.length;
 await save(first,{id:item.id,version:2,data:{...data,colorStyle:{mode:'solid',values:[]}}});
 assert.equal((await get(first)).colorLibrary.length,before);
 await stop();await start();assert.deepEqual((await get(first)).colorLibrary,state.colorLibrary);
 console.log('PASS: production color saves and compatibility field, shared account palette across wardrobes, account isolation, concurrent stale-save rollback, validation, retained history, v9 recovery and restart persistence.');
} finally {await stop();}
