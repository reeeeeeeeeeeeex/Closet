// Map a pointer in an object-fit:contain box to the original image pixel.
export function containedPixel(box: { width: number; height: number }, image: { width: number; height: number }, point: { x: number; y: number }) {
  if (box.width <= 0 || box.height <= 0 || image.width <= 0 || image.height <= 0) return null;
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const left = (box.width - image.width * scale) / 2, top = (box.height - image.height * scale) / 2;
  const x = (point.x - left) / scale, y = (point.y - top) / scale;
  return x < 0 || y < 0 || x >= image.width || y >= image.height ? null : { x: Math.floor(x), y: Math.floor(y) };
}
export function pixelHex(rgba: ArrayLike<number>): string | null {
  const alpha = rgba[3] / 255;
  if (!alpha) return null;
  return "#" + [0, 1, 2].map(index => Math.round(rgba[index] * alpha + 255 * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}
