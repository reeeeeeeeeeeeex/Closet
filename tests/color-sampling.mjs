import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
await build({entryPoints:['lib/color-sampling.ts'],outfile:'.test-runtime/color-sampling.cjs',bundle:true,platform:'node',format:'cjs',logLevel:'error'});
const {containedPixel,pixelHex}=createRequire(import.meta.url)(process.cwd()+'/.test-runtime/color-sampling.cjs');
// Landscape has top/bottom letterboxing; portrait has left/right letterboxing.
assert.deepEqual(containedPixel({width:300,height:300},{width:600,height:300},{x:75,y:150}),{x:150,y:150});
assert.equal(containedPixel({width:300,height:300},{width:600,height:300},{x:75,y:40}),null);
assert.deepEqual(containedPixel({width:300,height:300},{width:300,height:600},{x:150,y:75}),{x:150,y:150});
assert.equal(containedPixel({width:300,height:300},{width:300,height:600},{x:40,y:75}),null);
assert.deepEqual(containedPixel({width:375,height:240},{width:600,height:300},{x:187.5,y:120}),{x:300,y:150});
assert.equal(containedPixel({width:300,height:300},{width:600,height:300},{x:300,y:150}),null);
assert.equal(containedPixel({width:0,height:300},{width:600,height:300},{x:0,y:0}),null);
assert.equal(pixelHex([255,0,0,255]),'#ff0000');assert.equal(pixelHex([0,255,0,255]),'#00ff00');
assert.equal(pixelHex([0,0,0,0]),null);assert.equal(pixelHex([0,0,0,128]),'#7f7f7f');
console.log('PASS: landscape/portrait/scaled photo coordinates, letterbox and boundary rejection, exact known RGB samples and alpha handling.');
