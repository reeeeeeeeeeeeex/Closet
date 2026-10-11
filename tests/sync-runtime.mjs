import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
await mkdir('.test-runtime',{recursive:true});const directory=await mkdtemp(path.resolve('.test-runtime/sync-'));
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const base=`http://127.0.0.1:${port}`;let server,logs='';
async function start(){server=spawn(process.execPath,['scripts/local-server.mjs','start'],{env:{...process.env,CLOSET_HOST:'127.0.0.1',CLOSET_PORT:String(port),CLOSET_DATA_DIR:path.join(directory,'server')},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);for(let n=0;n<150;n++){if(server.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(logs);}
async function stop(){if(server?.exitCode===null){if(process.platform==='win32'){const p=spawn('taskkill',['/PID',String(server.pid),'/T','/F']);await once(p,'exit');}else server.kill();await new Promise(r=>setTimeout(r,300));}}
let cookie='',owner='';
const web=(url,body,method=body?'POST':'GET')=>fetch(base+url,{method,headers:{Cookie:cookie,Origin:base,'X-Closet-Profile':owner,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const data={name:'Desktop shirt',category:'top',color:'',seasons:[],occasions:[],notes:'',asset:null,archived:false};
globalThis.window=new EventTarget();
const bundle=path.join(directory,'phone.mjs');
await build({stdin:{contents:'export * from "./mobile/store"; export * from "./mobile/sync"; export * from "./mobile/client"; export * from "./lib/profile-client";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'error',plugins:[{name:'native',setup(b){b.onResolve({filter:/^\.\/native$/},()=>({path:'native',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const Native = globalThis.__closetNative;',loader:'js'}));}}]});
async function phone(name){
  const dir=path.join(directory,name);await mkdir(dir);const database=new DatabaseSync(path.join(dir,'phone.sqlite'));database.exec('CREATE TABLE documents (key TEXT PRIMARY KEY,revision INTEGER,value TEXT)');const assets=new Map(),uploads=new Map();
  const state={failAfterCommit:false,offline:false,beforeCommit:null,failWrite:false};
  globalThis.__closetNative={
    async read({key}){return {...(database.prepare('SELECT revision,value FROM documents WHERE key=?').get(key)||{revision:0,value:null}),filesRoot:dir};},
    async write({key,expected,value}){if(state.failWrite){state.failWrite=false;throw Error('disk full');}const row=database.prepare('SELECT revision FROM documents WHERE key=?').get(key);assert.equal(row?.revision||0,expected);database.prepare('INSERT OR REPLACE INTO documents VALUES (?,?,?)').run(key,expected+1,value);return {revision:expected+1};},
    async beginFile(){const handle=crypto.randomUUID();uploads.set(handle,[]);return {handle};},
    async appendFile({handle,data}){uploads.get(handle).push(Buffer.from(data,'base64'));},
    async finishFile({handle,name}){const bytes=Buffer.concat(uploads.get(handle)),hash=createHash('sha256').update(bytes).digest('hex');assets.set(hash,bytes);return {asset:{hash,name,mime:'image/png',size:bytes.length}};},
    async http({url,method,token,body}){if(state.offline)throw Error('offline');if(url.endsWith('/commit')&&state.beforeCommit){const fn=state.beforeCommit;state.beforeCommit=null;await fn();}const r=await fetch(url,{method,headers:{Authorization:token?`Bearer ${token}`:'','Content-Type':'application/json'},body});const response={status:r.status,body:await r.text()};if(url.endsWith('/commit')&&state.failAfterCommit){state.failAfterCommit=false;throw Error('connection lost after commit');}return response;},
    async transfer({url,token,asset,direction}){if(state.offline)throw Error('offline');const r=await fetch(url,{method:direction==='upload'?'PUT':'GET',headers:{Authorization:`Bearer ${token}`,'X-Asset-Name':encodeURIComponent(asset.name)},body:direction==='upload'?assets.get(asset.hash):undefined});assert.equal(r.status,200);if(direction==='download'){const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.hash);assets.set(asset.hash,bytes);}},
  };
  const mod=await import(pathToFileURL(bundle).href+`?phone=${name}`);const root=await mod.bootstrap();mod.setProfileContext(root.current);
  const request=async(url,body,method=body?'POST':'GET')=>{const r=await mod.androidClient.request(url,{method,headers:{'X-Closet-Profile':root.current},body:body?JSON.stringify(body):undefined});const json=await r.json();if(!r.ok)throw Error(json.error);return json;};
  const sync=()=>mod.synchronize(root.current,()=>{});
  return {mod,root,state,request,sync,assets,database};
}
const phones=[];
try{
  await start();let r=await fetch(base+'/api/profiles');cookie=r.headers.get('set-cookie').split(';')[0];owner=(await r.json()).current.id;
  r=await web('/api/closet',{op:'save',collectionId:'main',kind:'item',data});assert.equal(r.status,200);const original=(await (await web('/api/closet')).json()).records[0];
  const p=await phone('phone-one');phones.push(p);const pairing=await (await web('/api/sync/pairing',{})).json();
  await assert.rejects(()=>p.mod.pair(p.root.current,base,'0000000000'),/配对码/);
  await p.mod.pair(p.root.current,base,pairing.code);await p.sync();let local=await p.request('/api/closet');assert.equal(local.records[0].id,original.id);assert.equal(local.collections.length,1);
  const mutate=async(rec,name)=>p.request('/api/closet',{op:'save',collectionId:local.collectionId,kind:'item',id:rec.id,version:rec.version,data:{...rec.data,name}});
  p.state.offline=true;await mutate(local.records[0],'Offline phone edit');await assert.rejects(p.sync,/offline/);assert.equal((await p.request('/api/closet')).records[0].data.name,'Offline phone edit');p.state.offline=false;
  await p.sync();assert.equal((await (await web('/api/closet')).json()).records[0].data.name,'Offline phone edit');
  local=await p.request('/api/closet');await mutate(local.records[0],'Phone conflict');let pc=(await (await web('/api/closet')).json()).records[0];await web('/api/closet',{op:'save',collectionId:'main',kind:'item',id:pc.id,version:pc.version,data:{...pc.data,name:'PC conflict'}});await p.sync();let status=await p.mod.syncStatus(p.root.current);assert.equal(status.binding.conflicts.length,1);let c=status.binding.conflicts[0];await p.mod.synchronize(p.root.current,()=>{},{[c.key]:{choice:'local',signature:c.signature}});assert.equal((await (await web('/api/closet')).json()).records[0].data.name,'Phone conflict');assert.equal((await p.mod.syncStatus(p.root.current)).dirty,false);
  local=await p.request('/api/closet');await mutate(local.records[0],'Retry exactly once');p.state.failAfterCommit=true;await assert.rejects(p.sync,/connection lost/);assert.ok((await p.mod.syncStatus(p.root.current)).binding.pending);await stop();await start();await p.sync();assert.equal((await (await web('/api/closet')).json()).records.length,1);assert.equal((await p.mod.syncStatus(p.root.current)).binding.pending,undefined);
  local=await p.request('/api/closet');p.state.beforeCommit=async()=>{await mutate(local.records[0],'Saved during sync');};await p.sync();assert.equal((await p.request('/api/closet')).records[0].data.name,'Saved during sync');await p.sync();assert.equal((await (await web('/api/closet')).json()).records[0].data.name,'Saved during sync');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=','base64');const asset=await p.mod.androidClient.uploadAsset(new File([png],'exact.png',{type:'image/png'}),p.root.current);local=await p.request('/api/closet');await p.request('/api/closet',{op:'save',collectionId:local.collectionId,kind:'item',data:{...data,name:'Photo shirt',asset:asset.hash}});await p.sync();const binding=(await p.mod.syncStatus(p.root.current)).binding;assert.deepEqual(Buffer.from(await (await fetch(`${base}/api/sync/assets/${asset.hash}`,{headers:{Authorization:`Bearer ${binding.token}`}})).arrayBuffer()),png);
  const second=await phone('phone-two');phones.push(second);let s=await second.request('/api/closet');await second.request('/api/closet',{op:'save',collectionId:s.collectionId,kind:'item',data:{...data,name:'Existing phone wardrobe'}});const code2=await (await web('/api/sync/pairing',{})).json();await second.mod.pair(second.root.current,base,code2.code);await second.sync();assert.equal((await second.request('/api/closet')).collections.length,2);assert.deepEqual(second.assets.get(asset.hash),png);await p.sync();assert.equal((await p.request('/api/closet')).collections.length,2);
  const before=await p.request('/api/closet');p.state.failWrite=true;await assert.rejects(()=>p.request('/api/closet',{op:'save',collectionId:before.collectionId,kind:'item',data:{...data,name:'Failed save'}}),/disk full/);assert.deepEqual((await p.request('/api/closet')).records,before.records);
  assert.equal((await fetch(base+'/api/sync/state')).status,401);assert.equal((await fetch(base+'/api/sync/state',{headers:{Authorization:`Bearer ${'0'.repeat(64)}`}})).status,401);
  const bad=await fetch(base+'/api/sync/assets/'+asset.hash,{method:'PUT',headers:{Authorization:`Bearer ${binding.token}`},body:Buffer.from('broken')});assert.equal(bad.status,400);
  const subsetData={name:'Delete conflict',scope:'item',root:'all',parentId:null,memberIds:[]};
  assert.equal((await web('/api/closet',{op:'save',collectionId:'main',kind:'subset',data:subsetData})).status,200);await p.sync();
  const pcState=await (await web('/api/closet')).json(),group=pcState.records.find(r=>r.kind==='subset');
  const doc=(await p.mod.readDocument(p.root.current)).value,wardrobe=doc.replica.collections.find(c=>c.records.some(r=>r.id===group.id)),phoneGroup=wardrobe.records.find(r=>r.id===group.id);
  await p.request('/api/closet',{op:'save',collectionId:wardrobe.id,kind:'subset',id:group.id,version:phoneGroup.version,data:{...subsetData,name:'Edited before delete'}});
  assert.equal((await web('/api/closet',{op:'deleteSubset',collectionId:'main',kind:'subset',id:group.id,version:group.version,data:null})).status,200);
  await p.sync();c=(await p.mod.syncStatus(p.root.current)).binding.conflicts.find(c=>c.ids.includes(group.id));assert.ok(c);assert.equal(c.remote.length,0);
  await p.mod.synchronize(p.root.current,()=>{},{[c.key]:{choice:'remote',signature:c.signature}});
  assert.ok(!(await p.mod.readDocument(p.root.current)).value.replica.collections.flatMap(c=>c.records).some(r=>r.id===group.id));
  assert.ok((await p.mod.readDocument(p.root.current)).value.replica.tombstones.some(t=>t.id===group.id));
  await p.request('/api/closet',{op:'save',collectionId:wardrobe.id,kind:'subset',data:subsetData});await p.sync();
  const mobileGroup=(await p.mod.readDocument(p.root.current)).value.replica.collections.find(c=>c.id===wardrobe.id).records.find(r=>r.kind==='subset');
  await p.request('/api/closet',{op:'deleteSubset',collectionId:wardrobe.id,kind:'subset',id:mobileGroup.id,version:mobileGroup.version,data:null});await p.sync();
  assert.ok(!(await (await web('/api/closet')).json()).records.some(r=>r.id===mobileGroup.id));await second.sync();
  assert.ok(!(await second.mod.readDocument(second.root.current)).value.replica.collections.flatMap(c=>c.records).some(r=>r.id===mobileGroup.id));
  const expired=await (await web('/api/sync/pairing',{})).json();const disk=new DatabaseSync(path.join(directory,'server','closet.sqlite'));disk.exec('UPDATE sync_codes SET expires=0');disk.close();
  const pairRequest=code=>fetch(base+'/api/sync/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:1,code,deviceId:crypto.randomUUID(),name:'isolated'})});
  assert.equal((await pairRequest(expired.code)).status,400);assert.equal((await pairRequest(pairing.code)).status,400);
  const other=await web('/api/profiles',{action:'create',name:'Isolated sync account'}),otherCookie=other.headers.get('set-cookie').split(';')[0],otherOwner=(await other.json()).profile.id;
  const otherCode=await (await fetch(base+'/api/sync/pairing',{method:'POST',headers:{Cookie:otherCookie,Origin:base,'X-Closet-Profile':otherOwner}})).json();
  const otherPair=await (await pairRequest(otherCode.code)).json();
  const isolated=await (await fetch(base+'/api/sync/state',{headers:{Authorization:`Bearer ${otherPair.token}`,'X-Closet-Profile':owner}})).json();assert.equal(isolated.replica.collections.flatMap(c=>c.records).length,0);
  assert.equal((await fetch(base+'/api/sync/assets/'+asset.hash,{headers:{Authorization:`Bearer ${otherPair.token}`}})).status,404);
  assert.equal((await fetch(base+'/api/sync/pairing',{method:'POST',headers:{Cookie:cookie,Origin:'https://untrusted.invalid','X-Closet-Profile':owner}})).status,403);
  await web('/api/sync/pairing',{id:binding.id},'DELETE');await assert.rejects(p.sync,/配对已失效/);
  console.log('PASS: production server + two persisted phone clients: pairing/expired and single-use codes, empty/nonempty first sync, offline writes, bidirectional changes/deletes, deletion conflicts/tombstones, explicit resolution, lost-ack replay across restart, concurrent saves, exact images, multiple phones, disk-full failure, account isolation, origin guards, corrupted images and revocation.');
}finally{await stop();for(const p of phones)p.database.close();}
