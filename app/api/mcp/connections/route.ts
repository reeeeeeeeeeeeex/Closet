import { z } from "zod";
import { context, failure, json, limitedJson, sameOrigin } from "@/lib/server";
import { createConnection, listConnections, revokeConnection, listActivity } from "@/lib/ai-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const { owner } = await context(request); return json({ connections: listConnections(owner), activity: listActivity(owner) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { sameOrigin(request); const { owner } = await context(request); return json(createConnection(owner, await limitedJson(request, 4000))); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); const { owner } = await context(request); const { id } = z.object({ id: z.string().uuid() }).strict().parse(await limitedJson(request, 1000)); revokeConnection(owner, id); return json({ ok: true }); }
  catch (error) { return failure(error); }
}
