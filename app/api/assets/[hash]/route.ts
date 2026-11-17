import { context, failure, ApiError } from "@/lib/server";
import { hashSchema } from "@/lib/domain";
export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  try {
    const { db, owner, bucket } = await context(request); const { hash } = await params; hashSchema.parse(hash);
    const asset = await db.prepare("SELECT storage_key,mime,name FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first<{ storage_key: string; mime: string; name: string }>();
    if (!asset) throw new ApiError(404, "图片不存在"); const object = await bucket.get(asset.storage_key); if (!object) throw new ApiError(404, "原图暂时不可用");
    const headers = new Headers({ "Content-Type": asset.mime, "Content-Length": String(object.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(asset.name), "Accept-Ranges": "bytes" });
    const range = request.headers.get("range");
    if (!range) return new Response(object.body, { headers });
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1] ? Number(match[1]) : Math.max(0, object.size - Number(match?.[2]));
    const end = Math.min(object.size - 1, match?.[1] && match[2] ? Number(match[2]) : object.size - 1);
    if (!match || !(match[1] || match[2]) || start >= object.size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${object.size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(object.body.subarray(start, end + 1), { status: 206, headers });
  } catch (e) { return failure(e); }
}
