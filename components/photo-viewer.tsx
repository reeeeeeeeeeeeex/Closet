/* eslint-disable @next/next/no-img-element -- View the original pixels without an image proxy. */
"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Crop, Download, Loader2, Pencil, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/provider";
import { getClosetClient } from "@/lib/closet-client";
import { getProfileContext, withProfileActivity } from "@/lib/profile-client";
import { constrainPhoto, cropPixels, fitPhoto, INITIAL_TRANSFORM, initialCrop, moveCrop, resizeCrop, zoomPhoto, type CropRect, type PhotoTransform, type Point, type Size } from "@/lib/photo-view";

export type ViewerPhoto = { key: string; src: string; asset?: string | null };
export type CropPhoto = (file: File, photo: ViewerPhoto) => Promise<void> | void;

export function PhotoViewer({ photos, initialKey, name, onClose, onEdit, onCrop }: {
  photos: ViewerPhoto[]; initialKey?: string | null; name: string; onClose: () => void;
  onEdit?: () => void; onCrop?: CropPhoto;
}) {
  const [selected, setSelected] = useState(initialKey);
  const index = Math.max(0, photos.findIndex(photo => photo.key === selected));
  const photo = photos[index];
  if (!photo) return null;
  return <PhotoViewerContent key={photo.key} photo={photo} name={name} index={index} count={photos.length}
    onNavigate={step => setSelected(photos[(index + step + photos.length) % photos.length].key)}
    onClose={onClose} onEdit={onEdit} onCrop={onCrop}/>;
}

function PhotoViewerContent({ photo, name, index, count, onNavigate, onClose, onEdit, onCrop }: {
  photo: ViewerPhoto; name: string; index: number; count: number; onNavigate: (step: number) => void;
  onClose: () => void; onEdit?: () => void; onCrop?: CropPhoto;
}) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  // Dialog portals mount after the parent effect. Observe the actual stage attachment.
  const attachStage = useCallback((node: HTMLDivElement | null) => {
    stage.current = node;
    if (!node) return;
    const measure = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(measure);
    measure(); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const currentTransform = useRef(transform);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [ratio, setRatio] = useState<number | undefined>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pointers = useRef(new Map<number, Point>());
  const cropGesture = useRef<{ id: number; start: Point; rect: CropRect; corner: string } | null>(null);
  const fitted = fitPhoto(natural, viewport);
  const display = constrainPhoto(transform, fitted, viewport);
  function update(value: PhotoTransform) { currentTransform.current = value; setTransform(value); }
  function reset() { pointers.current.clear(); update(INITIAL_TRANSFORM); }
  function zoom(scale: number, anchor: Point = { x: 0, y: 0 }) {
    update(constrainPhoto(zoomPhoto(currentTransform.current, scale, anchor), fitted, viewport));
  }
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (crop || busy || !natural.width) return;
      const bounds = node.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1);
      const value = constrainPhoto(currentTransform.current, fitted, viewport);
      update(constrainPhoto(zoomPhoto(value, value.scale * Math.exp(-Math.max(-300, Math.min(300, delta)) * .002),
        { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 }), fitted, viewport));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [crop, busy, natural.width, fitted.width, fitted.height, viewport.width, viewport.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const point = (event: ReactPointerEvent) => ({ x: event.clientX, y: event.clientY });
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy || !natural.width || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    if (crop) {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]');
      if (target && !cropGesture.current) cropGesture.current = { id: event.pointerId, start: point(event), rect: crop, corner: target.dataset.cropHandle! };
      return;
    }
    currentTransform.current = display;
    pointers.current.set(event.pointerId, point(event));
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = cropGesture.current;
    if (gesture?.id === event.pointerId && fitted.width) {
      const factor = natural.width / fitted.width;
      const delta = { x: (event.clientX - gesture.start.x) * factor, y: (event.clientY - gesture.start.y) * factor };
      setCrop(gesture.corner === 'move' ? moveCrop(gesture.rect, delta, natural) : resizeCrop(gesture.rect, gesture.corner, delta, natural, ratio));
      return;
    }
    if (!pointers.current.has(event.pointerId)) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, point(event));
    const after = [...pointers.current.values()];
    if (after.length === 1) update(constrainPhoto({ ...currentTransform.current, x: currentTransform.current.x + after[0].x - before[0].x, y: currentTransform.current.y + after[0].y - before[0].y }, fitted, viewport));
    else {
      const midpoint = (points: Point[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const distance = (points: Point[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const bounds = stage.current!.getBoundingClientRect(), a = midpoint(before), b = midpoint(after);
      a.x -= bounds.left + bounds.width / 2; a.y -= bounds.top + bounds.height / 2;
      b.x -= bounds.left + bounds.width / 2; b.y -= bounds.top + bounds.height / 2;
      update(constrainPhoto(zoomPhoto(currentTransform.current, currentTransform.current.scale * distance(after) / Math.max(1, distance(before)), a, b), fitted, viewport));
    }
  }
  function pointerEnd(event: ReactPointerEvent) {
    pointers.current.delete(event.pointerId);
    if (cropGesture.current?.id === event.pointerId) cropGesture.current = null;
  }
  async function saveCrop() {
    if (!crop || !image.current || !onCrop || busy) return;
    setBusy(true); setError("");
    const canvas = document.createElement('canvas');
    try {
      const rect = cropPixels(crop, natural);
      canvas.width = rect.width; canvas.height = rect.height;
      const context = canvas.getContext('2d');
      if (!context) throw Error(t("无法处理这张照片，请缩小裁剪范围后重试。"));
      context.drawImage(image.current, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error(t("裁剪失败，请重试"))), 'image/png'));
      if (blob.size > 20 * 1024 * 1024) throw Error(t("裁剪结果超过 20 MB，请缩小裁剪范围。原图未改变。"));
      const filename = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'photo';
      await withProfileActivity(() => Promise.resolve(onCrop(new File([blob], `${filename}-crop.png`, { type: 'image/png' }), photo)));
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : t("裁剪失败，请重试")); }
    finally { canvas.width = 0; canvas.height = 0; setBusy(false); }
  }
  async function download() {
    setBusy(true); setError("");
    try {
      const client = getClosetClient();
      if (photo.asset && client?.saveAsset) await withProfileActivity(() => client.saveAsset!(photo.asset!, getProfileContext()!));
      else { const link = document.createElement('a'); link.href = photo.src; link.download = name; link.click(); }
    } catch (error) { setError(error instanceof Error ? error.message : t("下载失败，请重试")); }
    finally { setBusy(false); }
  }
  const rect = crop && fitted.width ? { left: (viewport.width - fitted.width) / 2 + crop.x / natural.width * fitted.width,
    top: (viewport.height - fitted.height) / 2 + crop.y / natural.height * fitted.height,
    width: crop.width / natural.width * fitted.width, height: crop.height / natural.height * fitted.height } : null;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="photo-viewer" style={{ translate: 'none' }} showCloseButton={false}
    onEscapeKeyDown={event => { if (busy || crop) { event.preventDefault(); if (!busy) setCrop(null); } }}
    onPointerDownOutside={event => event.preventDefault()}
    onKeyDown={event => {
      if (busy || crop || (event.target as HTMLElement).closest('button,select,input')) return;
      if (event.key === 'ArrowLeft' && count > 1) { event.preventDefault(); onNavigate(-1); }
      if (event.key === 'ArrowRight' && count > 1) { event.preventDefault(); onNavigate(1); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(display.scale * 1.25); }
      if (event.key === '-') { event.preventDefault(); zoom(display.scale / 1.25); }
    }}>
    <header className="photo-viewer-heading"><div><DialogTitle>{name}</DialogTitle><DialogDescription>{t("照片 {number} / {count}", { number: index + 1, count })}</DialogDescription></div><button type="button" aria-label={t("关闭大图")} disabled={busy} onClick={onClose}><X/></button></header>
    <div ref={attachStage} className={`photo-viewer-stage ${crop ? 'is-cropping' : ''}`} tabIndex={0} aria-label={t("照片缩放区域")}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
      onDoubleClick={() => { if (!crop && !busy) zoom(display.scale === 1 ? 2 : 1); }}>
      <img ref={image} src={photo.src} alt={name} draggable={false} className="photo-viewer-image"
        style={{ width: fitted.width || undefined, height: fitted.height || undefined, visibility: natural.width ? 'visible' : 'hidden', transform: `translate(-50%, -50%) translate(${display.x}px, ${display.y}px) scale(${display.scale})` }}
        onLoad={event => { setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setError(""); }}
        onError={() => setError(t("照片无法读取，请关闭后重试。"))}/>
      {!natural.width && !error && <Loader2 className="photo-viewer-loading animate-spin"/>}
      {rect && <div className="photo-crop-selection" data-crop-handle="move" style={rect}>
        <span className="photo-crop-grid"/>{['nw','ne','sw','se'].map(corner => <button type="button" key={corner} className={`photo-crop-handle ${corner}`} data-crop-handle={corner} aria-label={t("调整裁剪角 {corner}", { corner })}
          onKeyDown={event => { const directions: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } }; if (directions[event.key] && crop) { event.preventDefault(); event.stopPropagation(); setCrop(resizeCrop(crop, corner, directions[event.key], natural, ratio)); } }}/>)}</div>}
    </div>
    <footer className="photo-viewer-footer">{error && <p role="alert">{error}</p>}
      {crop ? <><p>{t("拖动选框和四角调整裁剪范围，原图会保留。")}</p><div className="photo-viewer-tools">
        <select aria-label={t("裁剪比例")} value={ratio || ''} disabled={busy} onChange={event => { const next = Number(event.target.value) || undefined; setRatio(next); setCrop(initialCrop(natural, next)); }}><option value="">{t("自由裁剪")}</option><option value="1">1:1</option><option value={3 / 4}>3:4</option><option value={4 / 3}>4:3</option></select>
        <button type="button" disabled={busy} onClick={() => setCrop(null)}>{t("取消裁剪")}</button><button type="button" className="photo-viewer-primary" disabled={busy} onClick={() => void saveCrop()}>{busy && <Loader2 className="animate-spin"/>}{t("保存为新照片")}</button>
      </div></> : <><div className="photo-viewer-tools">
        {count > 1 && <button type="button" disabled={busy} aria-label={t("上一张照片")} onClick={() => onNavigate(-1)}><ChevronLeft/></button>}
        <button type="button" disabled={!natural.width || busy || display.scale <= 1} aria-label={t("缩小照片")} onClick={() => zoom(display.scale / 1.25)}><ZoomOut/></button>
        <output aria-label={t("缩放比例")}>{Math.round(display.scale * 100)}%</output>
        <button type="button" disabled={!natural.width || busy || display.scale >= 8} aria-label={t("放大照片")} onClick={() => zoom(display.scale * 1.25)}><ZoomIn/></button>
        <button type="button" disabled={busy} onClick={reset}><RotateCcw/>{t("重置")}</button>
        {count > 1 && <button type="button" disabled={busy} aria-label={t("下一张照片")} onClick={() => onNavigate(1)}><ChevronRight/></button>}
      </div><div className="photo-viewer-tools">
        {onEdit && <button type="button" disabled={busy} onClick={() => { onClose(); onEdit(); }}><Pencil/>{t("编辑资料")}</button>}
        {onCrop && <button type="button" disabled={!natural.width || busy} onClick={() => { reset(); setCrop(initialCrop(natural)); setRatio(undefined); setError(""); }}><Crop/>{t("裁剪")}</button>}
        {(photo.asset || !getClosetClient()) && <button type="button" disabled={!natural.width || busy} onClick={() => void download()}><Download/>{t("下载原图")}</button>}
      </div><p>{t("双指或滚轮缩放，放大后拖动查看")}</p></>}
    </footer>
  </DialogContent></Dialog>;
}
