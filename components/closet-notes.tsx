/* eslint-disable @next/next/no-img-element -- Attachments use authenticated originals. */
"use client";

import { useEffect, useState } from "react";
import { ChevronRight, NotebookPen, Paperclip, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const { t, locale } = useI18n();
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");

  if (!notes.length) {
    return <section className="closet-notes is-empty" aria-label={t("笔记")}>
      <Button size="sm" variant="outline" className="closet-note-pill" disabled={disabled} onClick={onAdd}><NotebookPen size={14}/><span>{t("新建笔记")}</span></Button>
    </section>;
  }

  const latest = notes[0];
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = normalized
    ? notes.filter(note => [note.data.name, note.data.text].join(" ").toLocaleLowerCase().includes(normalized))
    : notes;

  return <section className="closet-notes" aria-label={t("笔记")}>
    <div className="closet-notes-bar">
      <button type="button" className="closet-notes-summary" onClick={() => setListOpen(true)}>
        <span className="closet-notes-badge" aria-hidden="true"><NotebookPen size={16} strokeWidth={1.8}/></span>
        <span className="closet-notes-summary-text">
          <span className="closet-notes-summary-head">
            <strong>{t("笔记")}</strong>
            <span className="closet-notes-count">{notes.length}</span>
          </span>
          <span className="closet-notes-summary-preview">{latest.data.name}</span>
        </span>
        <ChevronRight size={17} className="closet-notes-chevron" aria-hidden="true"/>
      </button>
      <Button type="button" size="sm" variant="ghost" className="closet-notes-quick-add" disabled={disabled} aria-label={t("新建笔记")} title={t("新建笔记")} onClick={onAdd}>
        <Plus size={16}/>
      </Button>
    </div>

    <Dialog open={listOpen} onOpenChange={open => { setListOpen(open); if (!open) setQuery(""); }}>
      <DialogContent className="closet-dialog notes-collection-dialog">
        <DialogHeader className="notes-collection-header">
          <div className="notes-collection-title-row">
            <div>
              <DialogTitle>{t("全部笔记")}</DialogTitle>
              <DialogDescription>{t("共 {count} 条笔记", { count: notes.length })}</DialogDescription>
            </div>
            <Button type="button" size="sm" disabled={disabled} onClick={() => { setListOpen(false); onAdd(); }}>
              <Plus size={15}/>
              {t("新建笔记")}
            </Button>
          </div>
        </DialogHeader>
        {notes.length > 3 && (
          <div className="notes-collection-search">
            <Search size={15} aria-hidden="true"/>
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("搜索笔记")} aria-label={t("搜索笔记")}/>
            {query && <button type="button" aria-label={t("清空搜索")} onClick={() => setQuery("")}><X size={14}/></button>}
          </div>
        )}
        <div className="notes-collection-scroll">
          {filtered.length ? (
            <div className="notes-collection-list">
              {filtered.map(note => {
                const location = locations.get(note.data.subsetId || "") || (note.data.root !== "all" ? t(CATEGORIES[note.data.root]) : "");
                const dateLabel = new Date(note.updatedAt).toLocaleDateString(locale, { month: "short", day: "numeric" });
                return <button className="closet-note-card" type="button" key={note.id} onClick={() => { setListOpen(false); onOpen(note); }}>
                  <div className="closet-note-card-head">
                    <strong>{note.data.name}</strong>
                    <time dateTime={note.updatedAt}>{dateLabel}</time>
                  </div>
                  {note.data.text && <span className="closet-note-excerpt">{note.data.text}</span>}
                  {(location || note.data.attachments.length > 0) && <span className="closet-note-meta">
                    {location && <span className="closet-note-location">{location}</span>}
                    {note.data.attachments.length > 0 && <span><Paperclip size={12}/> {t("{count} 个附件", { count: note.data.attachments.length })}</span>}
                  </span>}
                </button>;
              })}
            </div>
          ) : (
            <div className="notes-collection-empty">
              <NotebookPen size={26} strokeWidth={1.4}/>
              <p>{t("没有找到匹配的笔记")}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
