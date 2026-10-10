"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/provider";
import type { PhotoDraft, DraftPhoto } from "@/lib/photo-draft";
import { containedPixel, pixelHex } from "@/lib/color-sampling";
import { ColorSwatch } from "@/components/color-field";

type EyeDropperWindow = Window & { EyeDropper?: new () => { open: (options?: { signal: AbortSignal }) => Promise<{ sRGBHex: string }> } };
const subscribe = () => () => {};
const canPickScreen = () => window.isSecureContext && !!(window as EyeDropperWindow).EyeDropper;

export function ColorSamplingTools({ photos, onSample, onScreenPicking }: { photos: PhotoDraft; onSample: (hex: string) => void; onScreenPicking: (cancel: (() => void) | null) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [screenHex, setScreenHex] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const screenSupported = useSyncExternalStore(subscribe, canPickScreen, () => false);
  useEffect(() => () => abort.current?.abort(), []);
  async function pickScreen() {
    const Constructor = (window as EyeDropperWindow).EyeDropper;
    if (!Constructor) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError("");
    onScreenPicking(() => { controller.abort(); setBusy(false); });
    try { const result = await new Constructor().open({ signal: controller.signal }); if (!controller.signal.aborted) setScreenHex(result.sRGBHex.toLowerCase()); }
    catch (error) { if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) setError(t("屏幕取色未完成，可以改用照片取色或手动选择。")); }
    finally { onScreenPicking(null); if (!controller.signal.aborted) setBusy(false); }
  }
  return <>
    <Button type="button" variant="outline" onClick={() => { setError(""); if (photos.photos.length) setOpen(true); else setError(t("请先添加单品照片，再从照片取色。")); }}><Pipette size={14}/>{t("照片取色")}</Button>
    {screenSupported && <Button type="button" variant="outline" disabled={busy} onClick={() => void pickScreen()}>{busy ? t("正在取色") : t("屏幕取色")}</Button>}
    {error && <p className="color-sampling-error" role="alert">{error}</p>}
    {open && <PhotoSamplingDialog draft={photos} onClose={() => setOpen(false)} onConfirm={hex => { onSample(hex); setOpen(false); }}/>} 
    <Dialog open={screenHex !== null} onOpenChange={open => { if (!open) setScreenHex(null); }}><DialogContent className="closet-dialog color-confirm-dialog"><DialogHeader><DialogTitle>{t("确认取色")}</DialogTitle><DialogDescription>{t("确认后可填写颜色名称，也可以直接使用色值作为名称。")}</DialogDescription></DialogHeader>{screenHex && <div className="sample-result"><ColorSwatch color={{ name: screenHex, hex: screenHex }}/><code>{screenHex}</code></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setScreenHex(null)}>{t("取消")}</Button><Button type="button" onClick={() => { if (screenHex) onSample(screenHex); setScreenHex(null); }}>{t("使用此色块")}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function PhotoSamplingDialog({ draft, onClose, onConfirm }: { draft: PhotoDraft; onClose: () => void; onConfirm: (hex: string) => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState(draft.cover || draft.photos[0]?.key);
  const photo = draft.photos.find(photo => photo.key === key) || draft.photos[0];
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="closet-dialog color-photo-dialog"><DialogHeader><DialogTitle>{t("从照片取色")}</DialogTitle><DialogDescription>{t("点击照片上的颜色，预览后确认。可用方向键微调取色位置。")}</DialogDescription></DialogHeader>
    <div className="sample-photo-tabs" role="group" aria-label={t("选择取色照片")}>{draft.photos.map((value, index) => <Button type="button" variant={photo?.key === value.key ? "default" : "outline"} key={value.key} aria-pressed={photo?.key === value.key} onClick={() => setKey(value.key)}>{t("照片 {number}", { number: index + 1 })}{value.key === draft.cover ? " · " + t("封面") : ""}</Button>)}</div>
    {photo && <PhotoSamplingCanvas key={photo.key} photo={photo} onClose={onClose} onConfirm={onConfirm}/>} 
  </DialogContent></Dialog>;
}

function PhotoSamplingCanvas({ photo, onClose, onConfirm }: { photo: DraftPhoto; onClose: () => void; onConfirm: (hex: string) => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null), loupe = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [sample, setSample] = useState<{ x: number; y: number; hex: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const url = photo.file ? URL.createObjectURL(photo.file) : `/api/assets/${photo.asset}`;
    const image = new Image();
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      try {
        const node = canvas.current; node.width = image.naturalWidth; node.height = image.naturalHeight;
        const context = node.getContext("2d", { willReadFrequently: true });
        if (!context) throw Error("Canvas unavailable");
        context.drawImage(image, 0, 0); setReady(true);
      } catch { setError(t("照片无法读取，请选择其他照片。")); }
    };
    image.onerror = () => { if (!cancelled) setError(t("照片无法读取，请选择其他照片。")); };
    image.src = url;
    return () => { cancelled = true; image.onload = null; image.onerror = null; if (photo.file) URL.revokeObjectURL(url); };
  }, [photo, t]);
  useEffect(() => {
    const context = loupe.current?.getContext("2d");
    if (!context || !canvas.current || !sample) return;
    context.fillStyle = "#fff"; context.fillRect(0, 0, 90, 90); context.imageSmoothingEnabled = false;
    context.drawImage(canvas.current, sample.x - 4, sample.y - 4, 9, 9, 0, 0, 90, 90);
  }, [sample]);
  function pick(x: number, y: number) {
    if (!ready || !canvas.current) return;
    try {
      const hex = pixelHex(canvas.current.getContext("2d")!.getImageData(x, y, 1, 1).data);
      if (!hex) { setError(t("这里是透明区域，请选择照片中有颜色的位置。")); return; }
      setSample({ x, y, hex }); setError("");
    } catch { setError(t("照片无法读取，请选择其他照片。")); }
  }
  return <>
    <canvas ref={canvas} className="sample-photo" tabIndex={0} role="img" aria-label={t("取色照片")} onPointerDown={event => {
      if (!ready) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const point = containedPixel(rect, event.currentTarget, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (point) pick(point.x, point.y); else setError(t("请点击照片范围内的颜色。"));
    }} onKeyDown={event => {
      if (!ready || !canvas.current || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const node = canvas.current, x = sample?.x ?? Math.floor(node.width / 2), y = sample?.y ?? Math.floor(node.height / 2);
      pick(Math.max(0, Math.min(node.width - 1, x + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0))), Math.max(0, Math.min(node.height - 1, y + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0))));
    }}/>
    {!ready && !error && <p className="field-hint">{t("正在读取照片…")}</p>}
    {error && <p className="color-sampling-error" role="alert">{error}</p>}
    {sample && <div className="sample-result" aria-live="polite"><div className="sample-loupe"><canvas ref={loupe} width={90} height={90} aria-label={t("取色放大预览")}/><span aria-hidden="true">+</span></div><ColorSwatch color={{ name: sample.hex, hex: sample.hex }}/><code>{sample.hex}</code></div>}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t("取消")}</Button><Button type="button" disabled={!sample} onClick={() => { if (sample) onConfirm(sample.hex); }}>{t("使用此色块")}</Button></DialogFooter>
  </>;
}
