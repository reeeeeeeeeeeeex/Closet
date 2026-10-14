import { Native } from "./native";
import { read, readDocument, updateDocument, type RootState } from "./store";
import { mergeColors } from "./client";
import { mutateRecords } from "../lib/mutations";
import { itemColorStyle } from "../lib/colors";
import { connectToolsMcp, McpToolError, type ClosetToolsAdapter } from "../lib/mcp-core";
import { chatSchema, runModelAgent, ModelError } from "../lib/ai-runtime";
import type { AiEvent, ModelSettings, ToolScope } from "../lib/ai-types";

const busy = new Set<string>();
async function current(owner: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if ((await read<RootState>("root")).value?.current !== owner) throw new McpToolError(409, "账号已切换，请重新载入");
}
async function hash(input: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function phoneTools(owner: string, collectionId: string, scopes: ToolScope[], signal: AbortSignal): ClosetToolsAdapter {
  return {
    async records(scope) {
      await current(owner, signal);
      const active = (await Native.modelSettings({ owner })).settings;
      if (!scopes.includes(scope) || !active?.scopes.includes(scope)) throw new McpToolError(403, "此连接没有相应权限");
      const collection = (await readDocument(owner)).value.replica.collections.find(c => c.id === collectionId);
      if (!collection) throw new McpToolError(404, "衣橱不存在"); return collection.records;
    },
    async collection() { await current(owner, signal); const c = (await readDocument(owner)).value.replica.collections.find(c => c.id === collectionId); if (!c) throw new McpToolError(404, "衣橱不存在"); return { id: c.id, name: c.name }; },
    async preview(imageHash, size) {
      await current(owner, signal);
      const image = await Native.previewAsset({ owner, hash: imageHash, size });
      await current(owner, signal); return image;
    },
    async save(input, requestId) {
      await current(owner, signal); const bodyHash = await hash(input);
      return updateDocument(owner, async doc => {
        await current(owner, signal);
        if (!(await Native.modelSettings({ owner })).settings?.scopes.includes("write")) throw new McpToolError(403, "此连接没有相应权限");
        const receipt = doc.aiReceipts?.find(r => r.collectionId === collectionId && r.requestId === requestId);
        if (receipt) { if (receipt.hash !== bodyHash) throw new McpToolError(409, "本次保存编号已用于不同内容，请使用新的 requestId"); return receipt.result; }
        const c = doc.replica.collections.find(c => c.id === collectionId); if (!c) throw new McpToolError(404, "衣橱不存在");
        const next = mutateRecords(c.records, input, doc.replica.assets); c.records = next.records;
        doc.replica.colorLibrary = mergeColors(doc.replica.colorLibrary, c.records.flatMap(r => r.kind === "item" ? itemColorStyle(r.data).values.map(v => ({ ...v, usedAt: r.updatedAt })) : []));
        (doc.aiReceipts ||= []).push({ collectionId, requestId, hash: bodyHash, result: next.result });
        return next.result;
      });
    },
    async activity(tool, ok) { await updateDocument(owner, doc => { (doc.aiActivity ||= []).unshift({ id: crypto.randomUUID(), source: "手机内置 AI", tool, collectionId, ok, createdAt: new Date().toISOString() }); doc.aiActivity = doc.aiActivity.slice(0, 200); }); },
  };
}
export async function phoneModelRequest(owner: string, body: unknown, signal: AbortSignal) {
  await current(owner, signal);
  const requestId = crypto.randomUUID();
  const cancel = () => { void Native.cancelModelRequest({ requestId }).catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const response = await Native.modelRequest({ owner, requestId, body: JSON.stringify(body) });
    await current(owner, signal);
    if (response.status < 200 || response.status >= 300) throw new ModelError(502, `模型服务返回 ${response.status}，请检查模型名、密钥、额度与工具/视觉支持`);
    try { return JSON.parse(response.body) as unknown; } catch { throw new ModelError(502, "模型返回格式无效"); }
  } finally { signal.removeEventListener("abort", cancel); }
}
export async function phoneAiRequest(owner: string, path: string, method: string, body: unknown, requestSignal?: AbortSignal): Promise<Response> {
  await current(owner, requestSignal);
  if (path === "/api/ai/settings") {
    if (method === "GET") return Response.json(await Native.modelSettings({ owner }));
    if (method === "POST") return Response.json(await Native.saveModelSettings({ owner, settings: body as ModelSettings & { apiKey?: string } }));
    if (method === "DELETE") { await Native.clearModelSettings({ owner }); return Response.json({ ok: true }); }
  }
  if (path === "/api/mcp/connections" && method === "GET") return Response.json({ connections: [], activity: (await readDocument(owner)).value.aiActivity?.slice(0, 30) || [] });
  if (path !== "/api/ai/chat" || method !== "POST") throw new McpToolError(404, "本地接口不存在");
  const input = chatSchema.parse(body), settings = (await Native.modelSettings({ owner })).settings;
  if (!settings) throw new McpToolError(400, "请先配置模型服务");
  if (!(await readDocument(owner)).value.replica.collections.some(c => c.id === input.collectionId)) throw new McpToolError(404, "衣橱不存在");
  if (busy.has(owner)) throw new McpToolError(409, "此账号的 AI 正在处理另一个请求，请稍后重试");
  busy.add(owner);
  const abort = new AbortController(), signal = AbortSignal.any([requestSignal || new AbortController().signal, abort.signal]);
  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const emit = (event: AiEvent) => { if (open && !signal.aborted) { try { controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); } catch { open = false; abort.abort(); } } };
      void runModelAgent({ settings, connect: combined => connectToolsMcp({ collectionId: input.collectionId, scopes: settings.scopes, signal: combined }, phoneTools(owner, input.collectionId, settings.scopes, combined)), request: (_url, _headers, data, combined) => phoneModelRequest(owner, data, combined) }, input, signal, emit).catch(error => {
        emit({ type: "error", message: error instanceof ModelError || error instanceof McpToolError ? error.message : error instanceof Error && error.name === "TimeoutError" ? "模型响应超时，请重试" : "AI 请求未完成，请检查配置或稍后重试" });
      }).finally(() => { busy.delete(owner); if (open) { try { controller.close(); } catch {} } });
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
