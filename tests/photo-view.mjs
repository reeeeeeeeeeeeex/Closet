import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
await build({ entryPoints: ['lib/photo-view.ts', 'lib/photo-draft.ts'], outdir: '.test-runtime/photo-view-build', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, logLevel: 'error' });
const { fitPhoto, constrainPhoto, zoomPhoto, initialCrop, moveCrop, resizeCrop, cropPixels } = require('../.test-runtime/photo-view-build/photo-view.cjs');
const { createPhotoDraft, appendCroppedPhoto } = require('../.test-runtime/photo-view-build/photo-draft.cjs');
const image = { width: 1200, height: 800 }, viewport = { width: 360, height: 500 };
const fit = fitPhoto(image, viewport); assert.deepEqual(fit, { width: 360, height: 240 });
assert.deepEqual(constrainPhoto({ scale: .2, x: 900, y: -900 }, fit, viewport), { scale: 1, x: 0, y: 0 });
assert.deepEqual(constrainPhoto({ scale: 2, x: 900, y: -900 }, fit, viewport), { scale: 2, x: 180, y: 0 });
// The image coordinate beneath the pointer survives zoom; pinch translation follows its midpoint.
const view = { scale: 2, x: 20, y: -15 }, anchor = { x: 90, y: 50 }, moved = { x: 120, y: 70 };
const zoomed = zoomPhoto(view, 3, anchor, moved);
assert.equal((moved.x - zoomed.x) / zoomed.scale, (anchor.x - view.x) / view.scale);
assert.equal((moved.y - zoomed.y) / zoomed.scale, (anchor.y - view.y) / view.scale);
assert.equal(zoomPhoto(view, 100, anchor).scale, 8);
for (const ratio of [undefined, 1, 3 / 4, 4 / 3]) {
  const crop = initialCrop(image, ratio);
  if (ratio) assert.ok(Math.abs(crop.width / crop.height - ratio) < 1e-9);
  const moved = moveCrop(crop, { x: -5000, y: 5000 }, image);
  assert.equal(moved.x, 0); assert.equal(moved.y + moved.height, image.height);
  for (const corner of ['nw', 'ne', 'sw', 'se']) for (const delta of [{ x: -5000, y: 5000 }, { x: 5000, y: -5000 }, { x: -3, y: 2 }]) {
    const resized = resizeCrop(crop, corner, delta, image, ratio);
    assert.ok(resized.x >= 0 && resized.y >= 0 && resized.width > 0 && resized.height > 0);
    assert.ok(resized.x + resized.width <= image.width + 1e-9 && resized.y + resized.height <= image.height + 1e-9);
    if (ratio) assert.ok(Math.abs(resized.width / resized.height - ratio) < 1e-9);
  }
}
assert.deepEqual(cropPixels({ x: 1199.8, y: -5, width: 99, height: 8000 }, image), { x: 1199, y: 0, width: 1, height: 800 });
const a = 'a'.repeat(64), b = 'b'.repeat(64), file = new File(['png'], 'crop.png', { type: 'image/png' });
const original = createPhotoDraft({ asset: a, photos: [a, b] }), before = structuredClone(original);
const cropped = appendCroppedPhoto(original, file, a);
assert.deepEqual(original, before); assert.deepEqual(cropped.photos.slice(0, 2), original.photos);
assert.equal(cropped.photos.length, 3); assert.equal(cropped.cover, cropped.photos[2].key); assert.equal(cropped.photos[2].file, file);
assert.equal(appendCroppedPhoto(original, file, b).cover, a);
assert.throws(() => appendCroppedPhoto(original, file, 'removed'), /原照片/);
assert.throws(() => appendCroppedPhoto({ photos: Array(20).fill(original.photos[0]), cover: a }, file, a), /20/);
assert.deepEqual(original, before);
console.log('PASS: anchored zoom/pinch, bounded pan/crop, aspect ratios, pixel boundaries, separate crop copies, cover choice and photo limits.');
