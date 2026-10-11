import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
await build({entryPoints:['lib/profile-client.ts'],outfile:'.test-runtime/profile-client.cjs',bundle:true,platform:'node',format:'cjs',logLevel:'error'});
const {setProfileContext,assetUrl,profileFetch,withProfileActivity,getOperationCount,subscribeOperations}=createRequire(import.meta.url)(process.cwd()+'/.test-runtime/profile-client.cjs');
const original=globalThis.fetch;let request;
globalThis.fetch=async(url,options)=>{request={url,options};return new Response('{}');};
try {
 setProfileContext('one');await profileFetch('/api/closet',{method:'POST'});assert.equal(request.options.headers.get('X-Closet-Profile'),'one');
 assert.equal(assetUrl('hash'),'/api/assets/hash?profile=one');assert.equal(assetUrl('hash','old'),'/api/assets/hash?profile=old');
 setProfileContext('two');await profileFetch('/api/closet');assert.equal(request.options.headers.get('X-Closet-Profile'),'two');
 await profileFetch('/api/profiles');assert.equal(request.options.headers.get('X-Closet-Profile'),null);
 const counts=[];const unsubscribe=subscribeOperations(()=>counts.push(getOperationCount()));let finish;
 const running=withProfileActivity(()=>new Promise(resolve=>finish=resolve));assert.equal(getOperationCount(),1);
 finish();await running;assert.equal(getOperationCount(),0);
 await assert.rejects(()=>withProfileActivity(async()=>{throw Error('failed');}));assert.equal(getOperationCount(),0);assert.deepEqual(counts,[1,0,1,0]);unsubscribe();
 console.log('PASS: requests and photo links carry selected account; captured photo identity survives switches; operations block switching and release after success/failure.');
} finally {globalThis.fetch=original;}
