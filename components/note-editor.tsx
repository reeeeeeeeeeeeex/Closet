"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { ArrowLeft, Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListTodo, Quote, Undo2, Redo2, Paperclip, Trash2, X, Highlighter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Attachment } from "@/components/closet-notes";
import { NOTE_ATTACHMENT_LIMIT, NOTE_TEXT_LIMIT, noteSchema, type Asset, type Note, type NoteRecord } from "@/lib/domain";
import { NOTE_COLORS, NOTE_FONT_SIZES, NOTE_HIGHLIGHTS, noteDocument, notePlainText, noteAttachments, type NoteDocument } from "@/lib/note-document";
import { ASSET_LIMIT } from "@/lib/asset-type";
import { uploadAsset } from "@/lib/portable";
import { withProfileActivity } from "@/lib/profile-client";
import { useI18n } from "@/lib/i18n/provider";
import "./note-editor.css";

const MediaContext = createContext<Asset[]>([]);
function InlineAttachment({ node, deleteNode, editor, selected }: NodeViewProps) {
  const { t } = useI18n();
  const asset = useContext(MediaContext).find(asset => asset.hash === node.attrs.hash);
  return <NodeViewWrapper className={selected ? "note-media selected" : "note-media"} contentEditable={false}>
    {asset ? <Attachment asset={asset} name={node.attrs.name}/> : <p role="alert">{t("附件读取失败")}</p>}
    <button type="button" className="note-remove-media" disabled={!editor.isEditable} onClick={deleteNode} aria-label={t("移除附件 {name}", { name: node.attrs.name })}><X size={16}/></button>
  </NodeViewWrapper>;
}
const NoteAttachment = Node.create({
  name: "noteAttachment", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ hash: { default: "" }, name: { default: "" } }),
  // External HTML cannot introduce an attachment reference.
  parseHTML: () => [],
  renderHTML: ({ node }) => ["figure", { "data-note-attachment": node.attrs.hash }, node.attrs.name],
  addNodeView: () => ReactNodeViewRenderer(InlineAttachment),
});
const NoteFontSize = FontSize.extend({
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML(element) {
            const raw = element.style.fontSize;
            if (!raw) return null;
            const pixels = parseFloat(raw) * (raw.endsWith("pt") ? 4 / 3 : raw.endsWith("em") ? 18 : 1);
            return NOTE_FONT_SIZES.reduce((nearest, size) => Math.abs(parseInt(size) - pixels) < Math.abs(parseInt(nearest) - pixels) ? size : nearest);
          },
          renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
        },
      },
    }];
  },
});

export function NoteEditor({ record, location, assets, disabled, onClose, onSave, onDelete }: {
  record?: NoteRecord;
  location: Pick<Note, "scope" | "root" | "subsetId">;
  assets: Asset[];
  disabled: boolean;
  onClose: () => void;
  onSave: (data: Note, record?: NoteRecord) => Promise<void>;
  onDelete: (record: NoteRecord) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [name, setName] = useState(record?.data.name || "");
  const [openedAt] = useState(() => new Date(record?.updatedAt || Date.now()));
  const [media, setMedia] = useState(assets);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [highlightColor, setHighlightColor] = useState<string>(NOTE_HIGHLIGHTS[0]);
  const fileInput = useRef<HTMLInputElement>(null);
  const importHandler = useRef<(files: File[]) => void>(() => {});
  const initialContent = useMemo(() => noteDocument(record?.data || { text: "", attachments: [] }), [record]);
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false, link: false, heading: { levels: [1, 2, 3] } }),
      TextStyle, Color, NoteFontSize, Highlight.configure({ multicolor: true }),
      TaskList, TaskItem.configure({ nested: true }), NoteAttachment,
    ],
    content: initialContent,
    editable: !disabled,
    editorProps: {
      attributes: { class: "note-writing", role: "textbox", "aria-label": t("笔记正文"), "aria-multiline": "true", "data-placeholder": t("写下你的想法…") },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        importHandler.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files || []);
        if (moved || !files.length) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (position) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))));
        importHandler.current(files);
        return true;
      },
    },
    onUpdate: () => { setDirty(true); setError(""); },
  });
  useEffect(() => { editor?.setEditable(!busy && !disabled, false); }, [editor, busy, disabled]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function importFiles(files: File[]) {
    if (!editor || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const content = editor.getJSON() as NoteDocument;
      const current = noteAttachments(content);
      const texts = files.filter(file => /\.(txt|md)$/i.test(file.name));
      const attachments = files.filter(file => !texts.includes(file));
      if (current.length + attachments.length > NOTE_ATTACHMENT_LIMIT) throw new Error(t("每条笔记最多添加 10 个附件"));
      if (files.some(file => file.size > ASSET_LIMIT)) throw new Error(t("单个文件最多 20 MB"));
      const imported = await Promise.all(texts.map(async file => {
        try { return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
        catch { throw new Error(t("请导入 UTF-8 编码的文本文件")); }
      }));
      if (notePlainText(content).length + imported.join("\n").length > NOTE_TEXT_LIMIT) throw new Error(t("笔记正文最多 12000 个字符"));
      // Resolve all uploads before inserting so an interrupted import leaves the draft intact.
      const uploaded: Asset[] = [];
      for (const file of attachments) uploaded.push({ ...await uploadAsset(file, true), name: file.name.slice(0, 255) });
      setMedia(previous => [...previous, ...uploaded]);
      const nodes = imported.flatMap(text => noteDocument({ text, attachments: [] }).content || []);
      for (const asset of uploaded) nodes.push({ type: "noteAttachment", attrs: { hash: asset.hash, name: asset.name } });
      editor.chain().focus().insertContent([...nodes, { type: "paragraph" }]).run();
    } catch (cause) { setError(cause instanceof Error ? t(cause.message) : t("操作失败，请重试")); }
    finally { setBusy(false); }
  }
  useEffect(() => { importHandler.current = files => { void withProfileActivity(() => importFiles(files)); }; });

  async function save() {
    if (!editor || busy) return;
    if (!dirty && record) { onClose(); return; }
    setBusy(true);
    setError("");
    try {
      const content = editor.getJSON() as NoteDocument;
      const text = notePlainText(content);
      const parsed = noteSchema.safeParse({
        ...(record?.data || location), name: name.trim() || text.trim().split("\n")[0].slice(0, 100) || t("新建笔记"),
        text, content, attachments: noteAttachments(content),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await onSave(parsed.data, record);
    } catch (cause) { setError(cause instanceof Error ? t(cause.message) : t("操作失败，请重试")); setBusy(false); }
  }
  async function remove() {
    if (!record) return;
    setBusy(true);
    try { await onDelete(record); }
    catch (cause) { setError(cause instanceof Error ? t(cause.message) : t("操作失败，请重试")); setBusy(false); }
  }
  const close = () => { if (!busy) { if (dirty) setConfirm("discard"); else onClose(); } };
  const tools = editor && [
    { label: t("加粗"), icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: t("斜体"), icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: t("下划线"), icon: Underline, active: editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run() },
    { label: t("删除线"), icon: Strikethrough, active: editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    { label: t("高亮"), icon: Highlighter, active: editor.isActive("highlight"), run: () => editor.chain().focus().toggleHighlight({ color: highlightColor }).run() },
    { label: t("项目列表"), icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: t("编号列表"), icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: t("待办清单"), icon: ListTodo, active: editor.isActive("taskList"), run: () => editor.chain().focus().toggleTaskList().run() },
    { label: t("引用"), icon: Quote, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
  ];
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="note-editor-dialog" showCloseButton={false} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="sr-only"><DialogTitle>{t("编辑笔记")}</DialogTitle><DialogDescription>{t("直接书写并使用工具栏设置文字格式或插入附件。")}</DialogDescription></DialogHeader>
      <header className="note-topbar">
        <button type="button" onClick={close} disabled={busy} className="note-back"><ArrowLeft size={19}/>{t("笔记")}</button>
        <span className="note-save-status" role="status">{busy ? t("处理中…") : dirty ? t("未保存") : record ? t("已保存") : ""}</span>
        {record && <button type="button" className="note-delete" disabled={busy || disabled} aria-label={t("删除笔记")} onClick={() => setConfirm("delete")}><Trash2 size={18}/></button>}
        <Button type="button" className="note-done" disabled={!editor || busy || disabled} onClick={() => void withProfileActivity(save)}>{t("完成")}</Button>
      </header>
      <fieldset className="note-formatbar" disabled={!editor || busy || disabled} aria-label={t("文字格式")}>
        <div className="note-format-row">
          <select aria-label={t("段落样式")} value={editor?.isActive("heading") ? String(editor.getAttributes("heading").level) : "p"} onChange={event => {
            const value = event.target.value;
            if (value === "p") editor?.chain().focus().setParagraph().run();
            else editor?.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
          }}><option value="p">{t("正文")}</option><option value="1">{t("大标题")}</option><option value="2">{t("小标题")}</option><option value="3">{t("次级标题")}</option></select>
          <select aria-label={t("字号")} value={editor?.getAttributes("textStyle").fontSize || "18px"} onChange={event => editor?.chain().focus().setFontSize(event.target.value).run()}>
            {NOTE_FONT_SIZES.map(size => <option key={size} value={size}>{parseInt(size)}</option>)}
          </select>
          <label className="note-color-control"><span>{t("文字颜色")}</span><select aria-label={t("文字颜色")} value={editor?.getAttributes("textStyle").color || NOTE_COLORS[0]} onChange={event => editor?.chain().focus().setColor(event.target.value).run()}>
            {NOTE_COLORS.map((color, index) => <option key={color} value={color}>{[t("墨黑"), t("红色"), t("棕色"), t("绿色"), t("蓝色"), t("紫色")][index]}</option>)}
          </select></label>
          <label className="note-color-control"><span>{t("高亮颜色")}</span><select aria-label={t("高亮颜色")} value={highlightColor} onChange={event => {
            setHighlightColor(event.target.value);
            editor?.chain().focus().setHighlight({ color: event.target.value }).run();
          }}>{NOTE_HIGHLIGHTS.map((color, index) => <option key={color} value={color}>{[t("黄色"), t("绿色"), t("蓝色"), t("粉色"), t("紫色")][index]}</option>)}</select></label>
        </div>
        <div className="note-format-row">
          {tools?.map(tool => <button type="button" key={tool.label} aria-label={tool.label} title={tool.label} aria-pressed={tool.active} onPointerDown={event => event.preventDefault()} onClick={tool.run}><tool.icon size={18}/></button>)}
          <span className="note-toolbar-divider"/>
          <button type="button" aria-label={t("撤销")} title={t("撤销")} disabled={!editor?.can().undo()} onPointerDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={18}/></button>
          <button type="button" aria-label={t("重做")} title={t("重做")} disabled={!editor?.can().redo()} onPointerDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={18}/></button>
          <button type="button" className="note-insert" onClick={() => fileInput.current?.click()}><Paperclip size={18}/>{t("插入")}</button>
          <input ref={fileInput} id="note-import" type="file" hidden multiple accept=".txt,.md,.jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.webm,.mp3,.wav,.ogg,.m4a" onChange={event => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length) importHandler.current(files);
          }}/>
        </div>
      </fieldset>
      <div className="note-paper-scroll">
        <div className="note-paper">
          <time className="note-date">{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(openedAt)}</time>
          <input id="note-name" className="note-title-input" aria-label={t("标题")} placeholder={t("标题")} maxLength={100} value={name} disabled={busy || disabled} onChange={event => { setName(event.target.value); setDirty(true); }}/>
          <MediaContext.Provider value={media}><EditorContent editor={editor}/></MediaContext.Provider>
        </div>
      </div>
      {error && <p className="note-error" role="alert">{error}</p>}
      {confirm && <div className="note-confirm" role="alertdialog" aria-label={confirm === "delete" ? t("确认删除这条笔记？") : t("放弃未保存的笔记？")}>
        <p>{confirm === "delete" ? t("确认删除这条笔记？") : t("放弃未保存的笔记？")}</p>
        <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>{t("继续编辑")}</Button>
        <Button variant="destructive" disabled={busy} onClick={() => confirm === "delete" ? void remove() : onClose()}>{confirm === "delete" ? t("确认删除笔记") : t("放弃草稿")}</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}
