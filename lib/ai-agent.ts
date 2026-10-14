import { connectInternalMcp } from "./mcp-tools";
import { modelSettings } from "./ai-store";
import { ApiError } from "./server";
import { chatSchema, runModelAgent, fetchModelJson, ModelError } from "./ai-runtime";
import type { z } from "zod";
import type { AiEvent } from "./ai-types";
export { chatSchema } from "./ai-runtime";
export async function runClosetAgent(owner: string, input: z.infer<typeof chatSchema>, signal: AbortSignal, emit: (event: AiEvent) => void) {
  const settings = modelSettings(owner, true);
  if (!settings?.apiKey) throw new ApiError(400, "请先配置模型服务");
  try {
    await runModelAgent({ settings, connect: combined => connectInternalMcp({ owner, collectionId: input.collectionId, scopes: settings.scopes, source: "内置 AI", signal: combined }), request: fetchModelJson }, input, signal, emit);
  } catch (error) { if (error instanceof ModelError) throw new ApiError(error.status, error.message); throw error; }
}
