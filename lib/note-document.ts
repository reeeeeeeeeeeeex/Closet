import { z } from "zod";

export const NOTE_FONT_SIZES = ["14px", "16px", "18px", "22px", "28px", "36px"] as const;
export const NOTE_COLORS = ["#242424", "#b42318", "#b45309", "#15803d", "#1d4ed8", "#7e22ce"] as const;
export const NOTE_HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e9d5ff"] as const;
export type NoteNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null>;
  marks?: { type: string; attrs?: Record<string, string | null> }[];
  content?: NoteNode[];
};
export type NoteDocument = NoteNode & { type: "doc" };
const empty = z.object({}).strict();
const nodeAttributes: Record<string, z.ZodTypeAny> = {
  doc: empty, text: empty, paragraph: empty, hardBreak: empty, bulletList: empty, listItem: empty,
  taskList: empty, blockquote: empty, horizontalRule: empty,
  heading: z.object({ level: z.number().int().min(1).max(3) }).strict(),
  orderedList: z.object({ start: z.number().int().min(1).max(10000).default(1), type: z.string().nullable().optional() }).strict(),
  taskItem: z.object({ checked: z.boolean() }).strict(),
  noteAttachment: z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().min(1).max(255) }).strict(),
};
const cssColor = z.string().regex(/^(#[a-fA-F0-9]{6}|rgb\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}\s*\))$/).nullable().optional();
const markSchema = z.union([
  z.object({ type: z.enum(["bold", "italic", "underline", "strike"]), attrs: empty.optional() }).strict(),
  z.object({ type: z.literal("textStyle"), attrs: z.object({ color: cssColor, fontSize: z.enum(NOTE_FONT_SIZES).nullable().optional() }).strict() }).strict(),
  z.object({ type: z.literal("highlight"), attrs: z.object({ color: cssColor }).strict() }).strict(),
]);
const nodeSchema = z.object({
  type: z.string(), text: z.string().max(12000).optional(),
  attrs: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  marks: z.array(markSchema).max(6).optional(), content: z.array(z.unknown()).max(12000).optional(),
}).strict();
const blocks = ["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "horizontalRule", "noteAttachment"];
const children: Record<string, string[]> = {
  doc: blocks, blockquote: blocks, listItem: blocks, taskItem: blocks,
  bulletList: ["listItem"], orderedList: ["listItem"], taskList: ["taskItem"],
  paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"],
};

// Validate portable editor data before it can reach the renderer on either platform.
export const noteDocumentSchema = z.custom<NoteDocument>().superRefine((value, context) => {
  const pending = [{ node: value, depth: 0, parent: "" }];
  let count = 0;
  let textLength = 0;
  while (pending.length) {
    const { node, depth, parent } = pending.pop()!;
    const parsed = nodeSchema.safeParse(node);
    if (!parsed.success || ++count > 16000 || depth > 16) { context.addIssue({ code: "custom", message: "笔记格式无效或内容过长" }); return; }
    const data = parsed.data;
    const validAttributes = Object.hasOwn(nodeAttributes, data.type) ? nodeAttributes[data.type] : undefined;
    if (!validAttributes || !validAttributes.safeParse(data.attrs || {}).success ||
        (!parent && data.type !== "doc") || (parent && !children[parent]?.includes(data.type)) ||
        (data.type === "text" ? !data.text || !!data.content : data.text !== undefined || !!data.marks?.length) ||
        (!children[data.type] && !!data.content?.length) ||
        (["doc", "listItem", "taskItem", "bulletList", "orderedList", "taskList", "blockquote"].includes(data.type) && !data.content?.length)) {
      context.addIssue({ code: "custom", message: "笔记格式无效或内容过长" }); return;
    }
    textLength += data.text?.length || 0;
    if (textLength > 12000) { context.addIssue({ code: "custom", message: "笔记正文最多 12000 个字符" }); return; }
    for (const child of data.content || []) pending.push({ node: child as NoteDocument, depth: depth + 1, parent: data.type });
  }
  if (JSON.stringify(value).length > 250000) context.addIssue({ code: "custom", message: "笔记格式无效或内容过长" });
});

export function notePlainText(node: NoteNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return (node.content || []).map(notePlainText).join(["paragraph", "heading"].includes(node.type) ? "" : "\n").trimEnd();
}

export function noteAttachments(node: NoteNode): { hash: string; name: string }[] {
  if (node.type === "noteAttachment") return [{ hash: String(node.attrs!.hash), name: String(node.attrs!.name) }];
  return [...new Map((node.content || []).flatMap(noteAttachments).map(attachment => [attachment.hash, attachment])).values()];
}

export function noteDocument(note: { text: string; content?: NoteDocument; attachments: { hash: string; name: string }[] }): NoteDocument {
  return note.content || { type: "doc", content: [
    ...note.text.split("\n").map(text => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] })),
    ...note.attachments.map(attachment => ({ type: "noteAttachment", attrs: attachment })),
  ] };
}
