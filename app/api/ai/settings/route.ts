import { context, failure, json, limitedJson, sameOrigin } from "@/lib/server";
import { modelSettings, saveModelSettings } from "@/lib/ai-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const { owner } = await context(request); return json({ settings: modelSettings(owner) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { sameOrigin(request); const { owner } = await context(request); return json({ settings: saveModelSettings(owner, await limitedJson(request, 16000)) }); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); const { db, owner } = await context(request); db.prepare("DELETE FROM ai_settings WHERE owner=?").bind(owner).run(); return json({ ok: true }); }
  catch (error) { return failure(error); }
}
