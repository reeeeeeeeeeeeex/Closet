import { isIP } from "node:net";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/lib/ai-store";
import { createClosetMcpServer } from "@/lib/mcp-tools";
import { ApiError, failure, limitedJson, sameOrigin } from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const state = globalThis as typeof globalThis & { closetMcpRates?: Map<string, { count: number; start: number }> };
function authorize(request: Request) {
  sameOrigin(request);
  const hostname = new URL("http://" + (request.headers.get("host") || new URL(request.url).host)).hostname;
  const allowed = (process.env.CLOSET_MCP_ALLOWED_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (hostname !== "localhost" && !isIP(hostname.replace(/^\[|\]$/g, "")) && !allowed.includes(hostname)) throw new ApiError(403, "MCP 主机名未获允许");
  const ctx = authenticateMcp(request), rates = state.closetMcpRates ||= new Map();
  const now = Date.now();
  for (const [id, value] of rates) if (now - value.start >= 60000) rates.delete(id);
  const current = rates.get(ctx.connectionId) || { count: 0, start: now };
  if (++current.count > 120) throw new ApiError(429, "MCP 调用过于频繁，请稍后重试");
  rates.set(ctx.connectionId, current);
  return { ...ctx, signal: request.signal };
}
export async function POST(request: Request) {
  let server: ReturnType<typeof createClosetMcpServer> | undefined;
  try {
    const ctx = authorize(request);
    const body = await limitedJson(request, 128 * 1024);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    server = createClosetMcpServer(ctx);
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = failure(error);
    if (error instanceof ApiError && error.status === 401) response.headers.set("WWW-Authenticate", "Bearer");
    return response;
  } finally { await server?.close(); }
}
export async function GET(request: Request) {
  try { authorize(request); return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export const DELETE = GET;
