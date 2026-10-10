/* eslint-disable @next/next/no-img-element -- Preserve authenticated originals and local file previews. */
"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Download, ImagePlus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { MAX_PHOTOS, photoAssets, type PhotoData } from "@/lib/domain";
import { appendPhotoFiles, removeDraftPhoto, type PhotoDraft } from "@/lib/photo-draft";

export function PhotoEditor({ draft, onChange, kind, onError }: { draft: PhotoDraft; onChange: (draft: PhotoDraft) => void; kind: "item" | "outfit"; onError: (message: string) => void }) {
  const { t } = useI18n();
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [activeKey, setActiveKey] = useState(draft.cover);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const next = Object.fromEntries(draft.photos.filter(photo => photo.file).map(photo => [photo.key, URL.createObjectURL(photo.file!)]));
    // These previews are browser resources, released on replacement and unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(next);
    return () => Object.values(next).forEach(url => URL.revokeObjectURL(url));
  }, [draft.photos]);
  const active = draft.photos.find(photo => photo.key === activeKey) || draft.photos.find(photo => photo.key === draft.cover) || draft.photos[0];
  const source = (photo: PhotoDraft["photos"][number]) => photo.asset ? `/api/assets/${photo.asset}` : urls[photo.key];
  function choose(input: HTMLInputElement) {
    const files = Array.from(input.files || []); input.value = "";
    if (!files.length) return;
    try { const next = appendPhotoFiles(draft, files); onChange(next); setActiveKey(next.photos[draft.photos.length]?.key || next.cover); onError(""); }
    catch (error) { onError(error instanceof Error ? error.message : t("照片添加失败，请重试")); }
  }
  return <div className="photo-editor">
    <div className="photo-gallery-preview">{active && source(active) ? <img src={source(active)} alt={kind === "item" ? t("单品照片预览") : t("搭配照片预览")}/> : <div className="photo-gallery-empty"><ImagePlus size={32} strokeWidth={1.3}/><span>{kind === "item" ? t("添加单品照片") : t("添加上身照或整套搭配照片")}</span></div>}</div>
    <div className="photo-actions"><Button type="button" variant="outline" disabled={draft.photos.length >= MAX_PHOTOS} onClick={() => camera.current?.click()}><Camera size={16}/>{t("拍照")}</Button><Button type="button" variant="outline" disabled={draft.photos.length >= MAX_PHOTOS} onClick={() => library.current?.click()}><Upload size={16}/>{t("添加照片")}</Button></div>
    <input ref={library} type="file" multiple className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label={kind === "item" ? t("添加单品照片") : t("添加搭配照片")} onChange={event => choose(event.currentTarget)}/>
    <input ref={camera} type="file" capture="environment" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label={kind === "item" ? t("拍摄单品照片") : t("拍摄搭配照片")} onChange={event => choose(event.currentTarget)}/>
    <div className="photo-thumbnails">{draft.photos.map((photo, index) => <button type="button" key={photo.key} className={active?.key === photo.key ? "active" : ""} aria-label={t("查看照片 {number}", { number: index + 1 })} aria-pressed={active?.key === photo.key} onClick={() => setActiveKey(photo.key)}>{source(photo) && <img src={source(photo)} alt={t("照片 {number}", { number: index + 1 })}/>}<span>{photo.key === draft.cover ? t("封面") : index + 1}</span></button>)}</div>
    {active && <div className="photo-current-actions"><Button type="button" variant="outline" disabled={active.key === draft.cover} onClick={() => onChange({ ...draft, cover: active.key })}>{active.key === draft.cover ? t("当前封面") : t("设为封面")}</Button><Button type="button" variant="ghost" onClick={() => { onChange(removeDraftPhoto(draft, active.key)); onError(""); }}><X size={15}/>{t("移除当前照片")}</Button>{active.asset && <a className="text-link" href={`/api/assets/${active.asset}`} download><Download size={14}/>{t("下载原图")}</a>}</div>}
    <p className="field-hint">{t("{count} / 20 张照片 · 单张最多 20 MB，不压缩原图", { count: draft.photos.length })}<br/>{kind === "item" ? t("封面用于列表和搭配中的单品拼图。移除封面后，第一张照片自动成为封面。") : t("搭配封面用于我的搭配和穿搭日历。移除封面后，第一张照片自动成为封面。")}</p>
  </div>;
}

export function PhotoGallery({ data, name }: { data: PhotoData; name: string }) {
  const { t } = useI18n();
  const [active, setActive] = useState(data.asset);
  const photos = photoAssets(data);
  const selected = active && photos.includes(active) ? active : data.asset || photos[0];
  if (!selected) return null;
  return <div className="photo-gallery"><div className="photo-gallery-preview"><img src={`/api/assets/${selected}`} alt={name}/></div>{photos.length > 1 && <div className="photo-thumbnails">{photos.map((hash, index) => <button type="button" key={hash} className={selected === hash ? "active" : ""} aria-label={t("查看 {name} 的照片 {number}", { name, number: index + 1 })} aria-pressed={selected === hash} onClick={() => setActive(hash)}><img src={`/api/assets/${hash}`} alt={t("照片 {number}", { number: index + 1 })}/><span>{hash === data.asset ? t("封面") : index + 1}</span></button>)}</div>}</div>;
}
