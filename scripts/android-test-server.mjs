import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const port=Number(process.env.CLOSET_TEST_PORT||4337),directory=path.resolve('.test-runtime/android-server');await mkdir(directory,{recursive:true});
const server=spawn(process.execPath,['scripts/local-server.mjs','start'],{stdio:'inherit',env:{...process.env,CLOSET_DATA_DIR:directory,CLOSET_HOST:'0.0.0.0',CLOSET_PORT:String(port)}});
for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const base=`http://127.0.0.1:${port}`,profile=await fetch(base+'/api/profiles'),cookie=profile.headers.get('set-cookie').split(';')[0],owner=(await profile.json()).current.id;
const headers={Cookie:cookie,Origin:base,'X-Closet-Profile':owner};
const form=new FormData();form.append('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=','base64')],'fixture.png',{type:'image/png'}));
const image=await (await fetch(base+'/api/assets',{method:'POST',headers,body:form})).json();
await fetch(base+'/api/closet',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({op:'save',kind:'item',collectionId:'main',data:{name:'Android 同步验收',category:'top',color:'',occasions:[],seasons:[],notes:'production fixture',asset:image.hash,archived:false}})});
const pair=await (await fetch(base+'/api/sync/pairing',{method:'POST',headers})).json();
await writeFile('.test-runtime/android-connection.json',JSON.stringify({address:`http://10.0.2.2:${port}`,code:pair.code,owner,cookie,base,serverPid:server.pid}));
console.log('Android test fixture ready on port '+port);
server.on('exit',code=>{process.exitCode=code||0;});
process.on('SIGINT',()=>server.kill());process.on('SIGTERM',()=>server.kill());
