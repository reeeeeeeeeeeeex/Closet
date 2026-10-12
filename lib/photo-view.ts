export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type PhotoTransform = Point & { scale: number };
export type CropRect = Point & Size;
export const INITIAL_TRANSFORM: PhotoTransform = { x: 0, y: 0, scale: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) || 0;

export function fitPhoto(image: Size, viewport: Size): Size {
  if (!image.width || !image.height) return { width: 0, height: 0 };
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}
export function constrainPhoto(value: PhotoTransform, image: Size, viewport: Size): PhotoTransform {
  const scale = clamp(value.scale, 1, 8);
  const dx = Math.max(0, (image.width * scale - viewport.width) / 2);
  const dy = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { scale, x: clamp(value.x, -dx, dx), y: clamp(value.y, -dy, dy) };
}
/** Keep the photo point under the gesture anchor while zooming or moving a pinch. */
export function zoomPhoto(value: PhotoTransform, scale: number, anchor: Point, nextAnchor = anchor): PhotoTransform {
  const nextScale = clamp(scale, 1, 8), ratio = nextScale / value.scale;
  return { scale: nextScale, x: nextAnchor.x - (anchor.x - value.x) * ratio, y: nextAnchor.y - (anchor.y - value.y) * ratio };
}
export function initialCrop(image: Size, ratio?: number): CropRect {
  let width = image.width * .8, height = image.height * .8;
  if (ratio) { width = Math.min(width, height * ratio); height = width / ratio; }
  return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height };
}
export function moveCrop(rect: CropRect, delta: Point, image: Size): CropRect {
  return { ...rect, x: clamp(rect.x + delta.x, 0, image.width - rect.width), y: clamp(rect.y + delta.y, 0, image.height - rect.height) };
}
export function resizeCrop(rect: CropRect, corner: string, delta: Point, image: Size, ratio?: number): CropRect {
  const left = corner.includes('w'), top = corner.includes('n');
  const fixedX = left ? rect.x + rect.width : rect.x, fixedY = top ? rect.y + rect.height : rect.y;
  const maxWidth = left ? fixedX : image.width - fixedX, maxHeight = top ? fixedY : image.height - fixedY;
  let width = clamp(rect.width + (left ? -delta.x : delta.x), Math.min(16, maxWidth), maxWidth);
  let height = clamp(rect.height + (top ? -delta.y : delta.y), Math.min(16, maxHeight), maxHeight);
  if (ratio) {
    const target = Math.abs(delta.x) >= Math.abs(delta.y * ratio) ? rect.width + (left ? -delta.x : delta.x) : (rect.height + (top ? -delta.y : delta.y)) * ratio;
    const maximum = Math.min(maxWidth, maxHeight * ratio);
    width = clamp(target, Math.min(16, maximum), maximum);
    height = width / ratio;
  }
  return { x: left ? fixedX - width : fixedX, y: top ? fixedY - height : fixedY, width, height };
}
export function cropPixels(rect: CropRect, image: Size): CropRect {
  const x = clamp(Math.round(rect.x), 0, image.width - 1), y = clamp(Math.round(rect.y), 0, image.height - 1);
  return { x, y, width: clamp(Math.round(rect.width), 1, image.width - x), height: clamp(Math.round(rect.height), 1, image.height - y) };
}
