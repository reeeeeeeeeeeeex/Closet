/* eslint-disable @next/next/no-img-element -- Attachments use authenticated originals. */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NotebookPen, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, NOTE_ATTACHMENT_LIMIT, NOTE_TEXT_LIMIT, noteSchema, type Asset, type Note, type NoteRecord } from "@/lib/domain";
import { ASSET_LIMIT, NOTE_MEDIA_TYPES } from "@/lib/asset-type";
import { getClosetClient } from "@/lib/closet-client";
import { assetUrl, getProfileContext, withProfileActivity } from "@/lib/profile-client";
import { uploadAsset } from "@/lib/portable";
import { useI18n } from "@/lib/i18n/provider";

export function ClosetNotes({ notes, locations, disabled, onAdd, onOpen }: {
  notes: NoteRecord[];
  locations: Map<string, string>;
  disabled: boolean;
  onAdd: () => void;
  onOpen: (note: NoteRecord) => void;
}) {
  const { t } = useI18n();
  return <section className="closet-notes" aria-label={t("笔记")}>
    <header className="closet-notes-heading">
      <h2><NotebookPen size={17}/>{t("笔记")}</h2>
      <Button size="sm" variant="outline" disabled={disabled} onClick={onAdd}><Plus size={16}/>{t("新建笔记")}</Button>
    </header>
    {!!notes.length && <div className="closet-note-grid">
      {notes.map(note => {
        const location = locations.get(note.data.subsetId || "") || (note.data.root !== "all" ? t(CATEGORIES[note.data.root]) : "");
        return <button className="closet-note-card" type="button" key={note.id} onClick={() => onOpen(note)}>
          <strong>{note.data.name}</strong>
          {note.data.text && <span className="closet-note-excerpt">{note.data.text}</span>}
          <span className="closet-note-meta">{location}{note.data.attachments.length > 0 && <span><Paperclip size={13}/> {t("{count} 个附件", { count: note.data.attachments.length })}</span>}</span>
        </button>;
      })}
    </div>}
  </section>;
}

function Attachment({ asset, name }: { asset: Asset; name: string }) {
  const { t } = useI18n();
  const client = getClosetClient();
  const source = assetUrl(asset.hash);
  const image = asset.mime.startsWith("image/");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!client || image) return;
    const controller = new AbortController();
    let url = "";
    void fetch(source, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(new Blob([bytes], { type: asset.mime }));
      setPreview(url);
    }).catch(() => { if (!controller.signal.aborted) setError(t("附件读取失败")); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [asset.mime, client, image, source, t]);

  const mediaUrl = client && !image ? preview : source;
  const saveLocal = async () => {
    try { await client?.saveAsset?.(asset.hash, getProfileContext()!); }
    catch (cause) { setError(cause instanceof Error ? t(cause.message) : t("附件读取失败")); }
  };
  return <div className="closet-note-attachment">
    {mediaUrl && (image ? <img src={mediaUrl} alt={name}/> : asset.mime.startsWith("video/") ?
      <video src={mediaUrl} controls playsInline preload="metadata" aria-label={name}/> :
      <audio src={mediaUrl} controls preload="metadata" aria-label={name}/>)}
    {client ? <Button type="button" size="sm" variant="link" onClick={() => void saveLocal()}>{name}</Button> : <a href={source} download={name}>{name}</a>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function NoteEditor({ record, location, assets, disabled, onClose, onSave, onDelete }: {
  record?: NoteRecord;
  location: Pick<Note, "scope" | "root" | "subsetId">;
  assets: Asset[];
  disabled: boolean;
  onClose: () => void;
  onSave: (data: Note, record?: NoteRecord) => Promise<void>;
  onDelete: (record: NoteRecord) => Promise<void>;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<Note>(record?.data || { ...location, name: "", text: "", attachments: [] });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const report = (cause: unknown) => setError(cause instanceof Error ? t(cause.message) : t("操作失败，请重试"));

  async function importFiles(selected: File[]) {
    setError("");
    setBusy(true);
    try {
      const texts = selected.filter(file => /\.(txt|md)$/i.test(file.name));
      const attachments = selected.filter(file => !texts.includes(file));
      if (data.attachments.length + files.length + attachments.length > NOTE_ATTACHMENT_LIMIT) throw new Error("每条笔记最多添加 10 个附件");
      if (selected.some(file => file.size > ASSET_LIMIT)) throw new Error("单个文件最多 20 MB");
      const imported = await Promise.all(texts.map(async file => {
        const bytes = await file.arrayBuffer();
        try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim(); }
        catch { throw new Error(t("请导入 UTF-8 编码的文本文件")); }
      }));
      const text = [data.text, ...imported].filter(Boolean).join("\n\n");
      if (text.length > NOTE_TEXT_LIMIT) throw new Error("笔记正文最多 12000 个字符");
      setData({ ...data, text });
      setFiles([...files, ...attachments]);
    } catch (cause) { report(cause); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const attachments = new Map(data.attachments.map(attachment => [attachment.hash, attachment]));
      for (const file of files) {
        const asset = await uploadAsset(file, true);
        if (!attachments.has(asset.hash)) attachments.set(asset.hash, { hash: asset.hash, name: file.name.slice(0, 255) });
      }
      const parsed = noteSchema.safeParse({ ...data, attachments: [...attachments.values()] });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await onSave(parsed.data, record);
    } catch (cause) { report(cause); setBusy(false); }
  }

  async function remove() {
    if (!record) return;
    setBusy(true);
    setError("");
    try { await onDelete(record); }
    catch (cause) { report(cause); setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="closet-dialog editor-dialog">
      <DialogHeader>
        <DialogTitle>{record ? t("编辑笔记") : t("新建笔记")}</DialogTitle>
        <DialogDescription>{t("写下穿搭灵感，或导入文本、照片、音频和视频。")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={event => void withProfileActivity(() => submit(event))}>
        <fieldset disabled={busy || disabled} className="form-fields">
          <div className="field"><Label htmlFor="note-name">{t("标题")}</Label>
            <Input id="note-name" value={data.name} onChange={event => setData({ ...data, name: event.target.value })} required maxLength={100}/></div>
          <div className="field"><Label htmlFor="note-text">{t("正文")}</Label>
            <Textarea id="note-text" rows={7} maxLength={NOTE_TEXT_LIMIT} value={data.text} onChange={event => setData({ ...data, text: event.target.value })}/></div>
          <div className="field">
            <Label htmlFor="note-import">{t("导入文件")}</Label>
            <Input id="note-import" type="file" multiple accept={[".txt", ".md", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".mp4", ".webm", ".mp3", ".wav", ".ogg", ".m4a", ...NOTE_MEDIA_TYPES].join(",")} onChange={event => {
              const selected = Array.from(event.target.files || []);
              event.target.value = "";
              if (selected.length) void importFiles(selected);
            }}/>
            <p className="field-hint">{t("TXT、Markdown 会加入正文。图片、音频和视频每个最多 20 MB。")}</p>
          </div>
          {data.attachments.map(attachment => {
            const asset = assets.find(asset => asset.hash === attachment.hash);
            return <div className="closet-note-file" key={attachment.hash}>
              {asset && <Attachment asset={asset} name={attachment.name}/>}
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t("移除附件 {name}", { name: attachment.name })} onClick={() => setData({ ...data, attachments: data.attachments.filter(value => value.hash !== attachment.hash) })}><X size={16}/></Button>
            </div>;
          })}
          {files.map((file, index) => <div key={index} className="closet-note-file"><span>{file.name}</span><Button type="button" size="icon-sm" variant="ghost" aria-label={t("移除附件 {name}", { name: file.name })} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X size={16}/></Button></div>)}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        {confirm && <p role="alert">{t("确认删除这条笔记？")}</p>}
        <DialogFooter className="editor-footer">
          {record && <Button type="button" variant="destructive" disabled={busy || disabled} onClick={() => confirm ? void remove() : setConfirm(true)}>{confirm ? t("确认删除笔记") : t("删除笔记")}</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={confirm ? () => setConfirm(false) : onClose}>{t("取消")}</Button>
          <Button type="submit" disabled={busy || disabled || confirm}>{busy ? t("处理中…") : t("保存笔记")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
