import { context, failure, sameOrigin, limitedJson, ApiError } from "@/lib/server";
import { chatSchema, runClosetAgent } from "@/lib/ai-agent";
import { modelSettings } from "@/lib/ai-store";
import type { AiEvent } from "@/lib/ai-types";
import { ensureCloset } from "@/lib/closet-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const state = globalThis as typeof globalThis & { closetAiBusy?: Set<string> };
export async function POST(request: Request) {
  try {
    sameOrigin(request); const { owner, db } = await context(request);
    const input = chatSchema.parse(await limitedJson(request, 256 * 1024));
    ensureCloset(db, owner, input.collectionId);
    if (!modelSettings(owner)) throw new ApiError(400, "请先配置模型服务");
    const busy = state.closetAiBusy ||= new Set<string>();
    if (busy.has(owner)) throw new ApiError(409, "此账号的 AI 正在处理另一个请求，请稍后重试");
    busy.add(owner);
    const abort = new AbortController(), signal = AbortSignal.any([request.signal, abort.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let open = true;
        const emit = (event: AiEvent) => { if (open && !signal.aborted) { try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { open = false; abort.abort(); } } };
        void runClosetAgent(owner, input, signal, emit).catch(error => {
          emit({ type: "error", message: error instanceof ApiError ? error.message : error instanceof Error && error.name === "TimeoutError" ? "模型响应超时，请重试" : "AI 请求未完成，请检查配置或稍后重试" });
        }).finally(() => { busy.delete(owner); if (open) { try { controller.close(); } catch { /* Disconnected client. */ } } });
      },
      cancel() { abort.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (error) { return failure(error); }
}
