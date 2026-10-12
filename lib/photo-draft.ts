import { MAX_PHOTOS, photoAssets, type PhotoData } from "./domain";
import { tr } from "./i18n/core";
import { uploadAsset } from "./portable";

export type DraftPhoto = { key: string; asset: string | null; file: File | null };
export type PhotoDraft = { photos: DraftPhoto[]; cover: string | null };
export function createPhotoDraft(data: PhotoData): PhotoDraft {
  return { photos: photoAssets(data).map(asset => ({ key: asset, asset, file: null })), cover: data.asset };
}
export function appendPhotoFiles(draft: PhotoDraft, files: File[]): PhotoDraft {
  if (draft.photos.length + files.length > MAX_PHOTOS) throw new Error(tr("每条记录最多添加 20 张照片"));
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error(tr("单张图片最多 20 MB"));
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type)) throw new Error(tr("请选择 JPG、PNG、WebP、GIF 或 AVIF 图片"));
  }
  const photos = [...draft.photos, ...files.map(file => ({ key: crypto.randomUUID(), asset: null, file }))];
  return { photos, cover: draft.cover || photos[0]?.key || null };
}
export function removeDraftPhoto(draft: PhotoDraft, key: string): PhotoDraft {
  const photos = draft.photos.filter(photo => photo.key !== key);
  return { photos, cover: draft.cover === key ? photos[0]?.key || null : draft.cover };
}
/** Cropping adds a separate photo; originals and historical snapshots stay intact. */
export function appendCroppedPhoto(draft: PhotoDraft, file: File, sourceKey: string): PhotoDraft {
  if (!draft.photos.some(photo => photo.key === sourceKey)) throw new Error(tr("原照片已改变，请重新打开后裁剪。"));
  const next = appendPhotoFiles(draft, [file]);
  return { ...next, cover: draft.cover === sourceKey ? next.photos[next.photos.length - 1].key : draft.cover };
}
export async function savePhotoDraft(draft: PhotoDraft): Promise<Required<PhotoData>> {
  const hashes = new Map<string, string>();
  for (const photo of draft.photos) {
    const hash = photo.asset || (photo.file ? (await uploadAsset(photo.file)).hash : null);
    if (hash) hashes.set(photo.key, hash);
  }
  const photos = [...new Set(hashes.values())];
  return { photos, asset: (draft.cover && hashes.get(draft.cover)) || photos[0] || null };
}
