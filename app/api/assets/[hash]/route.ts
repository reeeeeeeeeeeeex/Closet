import { context, failure, ApiError } from "@/lib/server";
import { hashSchema } from "@/lib/domain";
export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  try {
    const { db, owner, bucket } = await context(request); const { hash } = await params; hashSchema.parse(hash);
    const asset = await db.prepare("SELECT storage_key,mime,name FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first<{ storage_key: string; mime: string; name: string }>();
    if (!asset) throw new ApiError(404, "图片不存在"); const object = await bucket.get(asset.storage_key); if (!object) throw new ApiError(404, "原图暂时不可用");
    return new Response(object.body, { headers: { "Content-Type": asset.mime, "Content-Length": String(object.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(asset.name) } });
  } catch (e) { return failure(e); }
}
