import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

await mkdir('.test-runtime',{recursive:true});
const directory=await mkdtemp(path.resolve('.test-runtime/accounts-'));
const salt=randomBytes(32).toString('hex'), secret=randomBytes(48).toString('hex');
await writeFile(path.join(directory,'auth.json'),JSON.stringify({salt,secret,passwordHash:scryptSync('old-password',salt,64).toString('hex')}));
const db=new DatabaseSync(path.join(directory,'closet.sqlite'));
db.exec(await readFile('drizzle/0000_perfect_klaw.sql','utf8'));
db.exec("CREATE TABLE _closet_migrations (name TEXT PRIMARY KEY); INSERT INTO _closet_migrations VALUES ('0000_perfect_klaw.sql')");
db.prepare('INSERT INTO collections VALUES (?,?,?,?)').run('local-owner','main','原衣橱',new Date().toISOString());
const recordId=crypto.randomUUID(), data={name:'原有衬衫',category:'top',color:'',occasions:[],seasons:[],asset:null,notes:'',archived:false};
db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)').run('local-owner','main',recordId,'item',JSON.stringify(data),1,new Date().toISOString(),new Date().toISOString());
db.close();
const reserve=createServer(); reserve.listen(0,'127.0.0.1'); await once(reserve,'listening'); const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
const base=`http://127.0.0.1:${port}`; let server, logs='';
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,CLOSET_HOST:'127.0.0.1',CLOSET_DATA_DIR:directory,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/login')).status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error(logs);}
async function stop(){if(server?.exitCode===null){const done=once(server,'exit');server.kill();await done;}}
const req=(url,options={},cookie='')=>fetch(base+url,{...options,headers:{Cookie:cookie,Origin:base,...options.headers},redirect:'manual'});
const auth=(username,password,action='login')=>req('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,action})});
const cookieOf=r=>r.headers.get('set-cookie').split(';')[0];
const save=(cookie,extra)=>req('/api/closet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'save',collectionId:'main',kind:'item',data,...extra})},cookie);
try{
  await start();
  const payload=`${Math.floor(Date.now()/1000)+600}.${randomBytes(16).toString('hex')}`;
  const oldCookie=`closet_session=${payload}.${createHmac('sha256',secret).update(payload).digest('hex')}`;
  assert.equal((await req('/',{},oldCookie)).headers.get('location'),'/login');
  assert.equal((await auth('original','wrong','claim')).status,401);
  let response=await auth(' Original ','old-password','claim');assert.equal(response.status,200,await response.clone().text());const originalCookie=cookieOf(response);
  assert.equal((await (await req('/api/closet',{},originalCookie)).json()).records[0].id,recordId);
  assert.equal((await auth('other','old-password','claim')).status,409);
  assert.equal((await auth('ORIGINAL','old-password')).status,200);
  assert.equal((await auth('Original','wrong')).status,401);
  response=await auth('second','x','register');assert.equal(response.status,200);const secondCookie=cookieOf(response);
  assert.deepEqual((await (await req('/api/closet',{},secondCookie)).json()).records,[]);
  assert.equal((await save(secondCookie,{id:recordId,version:1})).status,404);
  assert.equal((await save(secondCookie,{})).status,200);
  const firstState=await (await req('/api/closet',{},originalCookie)).json();assert.equal(firstState.records.length,1);assert.equal(firstState.records[0].id,recordId);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=','base64');
  const form=new FormData();form.append('file',new File([png],'account.png',{type:'image/png'}));response=await req('/api/assets',{method:'POST',body:form},originalCookie);assert.equal(response.status,200);const asset=await response.json();
  assert.equal((await req('/api/assets/'+asset.hash,{},secondCookie)).status,404);
  assert.equal((await save(secondCookie,{data:{...data,asset:asset.hash}})).status,400);
  const imported=await req('/api/closet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:'new-closet',schemaVersion:8,exportedAt:new Date().toISOString(),collection:{name:'private'},records:[],assets:[]})},originalCookie);const importedId=(await imported.json()).collectionId;
  assert.equal((await req('/api/closet?collection='+importedId,{},secondCookie)).status,404);
  for(const invalid of ['',null])assert.equal((await auth('blank',invalid,'register')).status,400);
  assert.equal((await auth('spaces',' ','register')).status,200);
  const duplicates=await Promise.all([auth('same','1','register'),auth(' SAME ','2','register')]);assert.deepEqual(duplicates.map(r=>r.status).sort(),[200,409]);
  const forged=secondCookie.replace(secondCookie.split('.')[0].split('=')[1],'local-owner');assert.equal((await req('/api/closet',{},forged)).status,401);
  response=await req('/api/auth',{method:'DELETE'},secondCookie);assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await req('/api/closet')).status,401);
  await stop();await start();assert.equal((await auth('second','x')).status,200);assert.equal((await (await req('/api/closet',{},originalCookie)).json()).records[0].id,recordId);
  console.log('PASS: legacy account claim preserves records and sessions; short/nonempty passwords; login/logout; concurrent duplicate usernames; account record, collection and original-photo isolation; forged sessions rejected; restart persistence.');
}finally{await stop();}
