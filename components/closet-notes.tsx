/* eslint-disable @next/next/no-img-element -- Attachments use authenticated originals. */
"use client";

import { useEffect, useState } from "react";
import { NotebookPen, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type Asset, type NoteRecord } from "@/lib/domain";
import { getClosetClient } from "@/lib/closet-client";
import { assetUrl, getProfileContext } from "@/lib/profile-client";
import { useI18n } from "@/lib/i18n/provider";

export function ClosetNotes({ notes, locations, disabled, onAdd, onOpen }: {
  notes: NoteRecord[];
  locations: Map<string, string>;
  disabled: boolean;
  onAdd: () => void;
  onOpen: (note: NoteRecord) => void;
}) {
  const { t } = useI18n();
  if (!notes.length) {
    return <section className="closet-notes is-empty" aria-label={t("笔记")}>
      <Button size="sm" variant="outline" className="closet-note-pill" disabled={disabled} onClick={onAdd}><NotebookPen size={14}/><span>{t("新建笔记")}</span></Button>
    </section>;
  }
  return <section className="closet-notes" aria-label={t("笔记")}>
    <header className="closet-notes-heading">
      <h2><NotebookPen size={16}/>{t("笔记")}</h2>
      <Button size="sm" variant="outline" className="closet-note-pill" disabled={disabled} onClick={onAdd}><Plus size={15}/>{t("新建笔记")}</Button>
    </header>
    <div className="closet-note-grid">
      {notes.map(note => {
        const location = locations.get(note.data.subsetId || "") || (note.data.root !== "all" ? t(CATEGORIES[note.data.root]) : "");
        return <button className="closet-note-card" type="button" key={note.id} onClick={() => onOpen(note)}>
          <strong>{note.data.name}</strong>
          {note.data.text && <span className="closet-note-excerpt">{note.data.text}</span>}
          {(location || note.data.attachments.length > 0) && <span className="closet-note-meta">{location}{note.data.attachments.length > 0 && <span><Paperclip size={12}/> {t("{count} 个附件", { count: note.data.attachments.length })}</span>}</span>}
        </button>;
      })}
    </div>
  </section>;
}

export function Attachment({ asset, name }: { asset: Asset; name: string }) {
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
